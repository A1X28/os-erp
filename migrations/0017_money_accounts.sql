-- Cash, bank, Kaspi as accounts. Payments move money. Cannot go below zero.

create or replace function os_fx_norm() returns trigger as $$
begin
  new.currency := upper(new.currency);
  if tg_table_name = 'documents' then
    if new.type = 'inventory' then
      new.currency := os_base_currency();
      new.fx_rate := 1;
    end if;
  end if;
  if new.currency = os_base_currency() then
    new.fx_rate := 1;
  end if;
  if new.fx_rate is null or new.fx_rate <= 0 then
    perform os_raise('Курс должен быть больше нуля');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists money_accounts (
  id          serial primary key,
  kind        text not null check (kind in ('cash', 'bank', 'kaspi')),
  name        text not null check (length(trim(name)) > 0),
  currency    text not null default 'RUB',
  is_default  boolean not null default false
);

alter table money_accounts drop constraint if exists money_accounts_currency_chk;
alter table money_accounts add constraint money_accounts_currency_chk
  check (currency in ('RUB', 'EUR', 'USD', 'KZT'));

create unique index if not exists money_accounts_default_kind
  on money_accounts (kind) where is_default;

create table if not exists money_balance (
  account_id int primary key references money_accounts(id),
  amount     numeric(14,2) not null default 0,
  constraint money_balance_nonneg check (amount >= 0)
);

create or replace function os_account_balance_row() returns trigger as $$
begin
  insert into money_balance (account_id, amount)
  values (new.id, 0)
  on conflict (account_id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_account_balance_trg on money_accounts;
create trigger os_account_balance_trg
  after insert on money_accounts
  for each row execute procedure os_account_balance_row();

insert into money_accounts (kind, name, currency, is_default)
select v.kind, v.name, v.currency, v.is_default
from (values
  ('cash',  'Касса',           'RUB', true),
  ('bank',  'Расчётный счёт',  'RUB', true),
  ('kaspi', 'Kaspi',           'RUB', true),
  ('bank',  'Счёт EUR',        'EUR', false)
) as v(kind, name, currency, is_default)
where not exists (select 1 from money_accounts a where a.kind = v.kind and a.currency = v.currency and a.name = v.name);

insert into money_balance (account_id, amount)
select id, 0 from money_accounts
on conflict (account_id) do nothing;

alter table payments
  add column if not exists account_id int references money_accounts(id);

update payments p
   set account_id = (
     select a.id from money_accounts a
      where a.kind = p.method
        and a.currency = coalesce(p.currency, 'RUB')
      order by a.is_default desc, a.id
      limit 1
   )
 where account_id is null;

-- leftover currency/method pairs
insert into money_accounts (kind, name, currency, is_default)
select distinct p.method,
       case p.method
         when 'cash' then 'Касса '
         when 'kaspi' then 'Kaspi '
         else 'Счёт '
       end || coalesce(p.currency, 'RUB'),
       coalesce(p.currency, 'RUB'),
       false
  from payments p
 where p.account_id is null
   and not exists (
     select 1 from money_accounts a
      where a.kind = p.method and a.currency = coalesce(p.currency, 'RUB')
   );

update payments p
   set account_id = (
     select a.id from money_accounts a
      where a.kind = p.method
        and a.currency = coalesce(p.currency, 'RUB')
      order by a.is_default desc, a.id
      limit 1
   )
 where account_id is null;

insert into money_balance (account_id, amount)
select id, 0 from money_accounts
on conflict (account_id) do nothing;

alter table payments
  alter column account_id set not null;

create table if not exists money_transfers (
  id           serial primary key,
  number       text not null unique,
  pay_date     date not null,
  from_id      int not null references money_accounts(id),
  to_id        int not null references money_accounts(id),
  amount       numeric(14,2) not null check (amount > 0),
  comment      text not null default '',
  created_at   timestamptz not null default now(),
  constraint money_transfers_diff check (from_id <> to_id)
);

create or replace function os_pay_guard() returns trigger as $$
declare
  dtype text;
  partner int;
  st text;
  dcur text;
  akind text;
  acur text;
begin
  if tg_op = 'UPDATE' then
    perform os_raise('Оплату нельзя менять — удалите и создайте заново');
  end if;
  if new.account_id is null then
    perform os_raise('Укажите кассу или счёт');
  end if;
  select kind, currency into akind, acur from money_accounts where id = new.account_id;
  if akind is null then
    perform os_raise('Счёт не найден');
  end if;
  new.method := akind;
  if new.currency is distinct from acur then
    perform os_raise('Валюта оплаты должна совпадать со счётом');
  end if;
  if new.document_id is null then
    return new;
  end if;
  select type, counterparty_id, status, currency into dtype, partner, st, dcur
    from documents where id = new.document_id;
  if dtype is null then
    perform os_raise('Оплата ссылается на несуществующий документ');
  end if;
  if st is distinct from 'posted' then
    perform os_raise('Оплату можно повесить только на проведённый документ');
  end if;
  if partner is not null and partner is distinct from new.partner_id then
    perform os_raise('Контрагент оплаты не совпадает с документом');
  end if;
  if dcur is not null and new.currency is distinct from dcur then
    perform os_raise('Валюта оплаты должна совпадать с документом');
  end if;
  if new.kind = 'in' and dtype not in ('order', 'invoice', 'sale', 'purchase_return') then
    perform os_raise('Входящие деньги только к продаже или возврату поставщику');
  end if;
  if new.kind = 'out' and dtype not in ('po', 'bill', 'purchase', 'sale_return') then
    perform os_raise('Исходящие деньги только к закупке или возврату покупателю');
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function os_money_apply() returns trigger as $$
declare
  aid int;
  delta numeric;
  have numeric;
begin
  if tg_op = 'INSERT' then
    aid := new.account_id;
    delta := case when new.kind = 'in' then new.amount else -new.amount end;
  else
    aid := old.account_id;
    delta := case when old.kind = 'in' then -old.amount else old.amount end;
  end if;

  insert into money_balance (account_id, amount)
  values (aid, 0)
  on conflict (account_id) do nothing;

  select amount into have from money_balance where account_id = aid for update;
  have := coalesce(have, 0) + delta;
  if have < 0 then
    perform os_raise('Недостаточно денег на счёте — система не даёт уйти в минус');
  end if;
  update money_balance set amount = have where account_id = aid;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_money_apply_trg on payments;
create trigger os_money_apply_trg
  after insert or delete on payments
  for each row execute procedure os_money_apply();

create or replace function os_transfer_guard() returns trigger as $$
declare
  fcur text;
  tcur text;
begin
  if tg_op = 'UPDATE' then
    perform os_raise('Перемещение денег нельзя менять — удалите и создайте заново');
  end if;
  if tg_op = 'DELETE' then
    if os_period_closed(old.pay_date) then
      perform os_raise('Период закрыт — перемещение за эту дату удалять нельзя');
    end if;
    return old;
  end if;
  if os_period_closed(new.pay_date) then
    perform os_raise('Период закрыт — перемещение на эту дату ставить нельзя');
  end if;
  select currency into fcur from money_accounts where id = new.from_id;
  select currency into tcur from money_accounts where id = new.to_id;
  if fcur is null or tcur is null then
    perform os_raise('Счёт не найден');
  end if;
  if fcur is distinct from tcur then
    perform os_raise('Перемещать можно только в той же валюте');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_transfer_guard_trg on money_transfers;
create trigger os_transfer_guard_trg
  before insert or update or delete on money_transfers
  for each row execute procedure os_transfer_guard();

create or replace function os_transfer_apply() returns trigger as $$
declare
  have numeric;
  first_id int;
  second_id int;
begin
  if tg_op = 'INSERT' then
    first_id := least(new.from_id, new.to_id);
    second_id := greatest(new.from_id, new.to_id);
    insert into money_balance (account_id, amount) values (first_id, 0)
      on conflict (account_id) do nothing;
    insert into money_balance (account_id, amount) values (second_id, 0)
      on conflict (account_id) do nothing;
    perform amount from money_balance where account_id = first_id for update;
    perform amount from money_balance where account_id = second_id for update;
    select amount into have from money_balance where account_id = new.from_id;
    if coalesce(have, 0) < new.amount then
      perform os_raise('Недостаточно денег на счёте — система не даёт уйти в минус');
    end if;
    update money_balance set amount = amount - new.amount where account_id = new.from_id;
    update money_balance set amount = amount + new.amount where account_id = new.to_id;
    return new;
  end if;
  first_id := least(old.from_id, old.to_id);
  second_id := greatest(old.from_id, old.to_id);
  perform amount from money_balance where account_id = first_id for update;
  perform amount from money_balance where account_id = second_id for update;
  select amount into have from money_balance where account_id = old.to_id;
  if coalesce(have, 0) < old.amount then
    perform os_raise('Нельзя отменить перемещение: деньги со счёта назначения уже ушли');
  end if;
  update money_balance set amount = amount - old.amount where account_id = old.to_id;
  update money_balance set amount = amount + old.amount where account_id = old.from_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists os_transfer_apply_trg on money_transfers;
create trigger os_transfer_apply_trg
  after insert or delete on money_transfers
  for each row execute procedure os_transfer_apply();

-- Replay payments into balances. Clamp if history is net-negative (no opening cash).
update money_balance b
   set amount = greatest(0, coalesce((
     select sum(case when p.kind = 'in' then p.amount else -p.amount end)
       from payments p where p.account_id = b.account_id
   ), 0));
