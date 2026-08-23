-- Opening balances: stock document, cash without a partner, partner debts.

alter table documents drop constraint if exists documents_type_chk;
alter table documents add constraint documents_type_chk check (type in (
  'po', 'bill', 'purchase', 'order', 'invoice', 'sale', 'transfer', 'writeoff',
  'sale_return', 'purchase_return', 'inventory', 'opening'
));

create or replace function os_fx_norm() returns trigger as $$
begin
  new.currency := upper(new.currency);
  if tg_table_name = 'documents' then
    if new.type in ('inventory', 'opening') then
      new.currency := os_base_currency();
      new.fx_rate := 1;
    end if;
    if new.type = 'opening' then
      if new.warehouse_id is null then
        perform os_raise('Укажите склад');
      end if;
      if new.counterparty_id is not null then
        perform os_raise('Начальные остатки товаров без контрагента');
      end if;
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

create or replace function os_lines_guard() returns trigger as $$
declare
  st text;
  dtype text;
  doc_id int;
begin
  doc_id := coalesce(new.document_id, old.document_id);
  select status, type into st, dtype from documents where id = doc_id;
  if st = 'posted' then
    perform os_raise('Нельзя менять строки проведённого документа');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if dtype = 'inventory' then
    if new.qty < 0 then
      perform os_raise('Факт не может быть отрицательным');
    end if;
  elsif new.qty <= 0 then
    perform os_raise('Количество должно быть больше нуля');
  end if;
  new.amount := round(new.qty * new.price, 2);
  return new;
end;
$$ language plpgsql;

create or replace function os_moves_guard() returns trigger as $$
declare
  dtype text;
  st text;
  wh int;
  wh_from int;
  wh_to int;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    perform os_raise('Движение склада нельзя править');
  end if;
  select type, status, warehouse_id, from_warehouse_id, to_warehouse_id
    into dtype, st, wh, wh_from, wh_to
    from documents where id = new.document_id;
  if st is null then
    perform os_raise('Движение склада без документа');
  end if;
  if st <> 'posted' then
    perform os_raise('Движения склада только у проведённого документа');
  end if;
  if dtype not in (
    'purchase', 'sale', 'writeoff', 'transfer',
    'sale_return', 'purchase_return', 'inventory', 'opening'
  ) then
    perform os_raise('Этот документ не двигает склад');
  end if;
  if dtype in ('purchase', 'sale_return', 'opening') then
    if new.qty <= 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Приход должен приходовать на склад документа');
    end if;
  elsif dtype in ('sale', 'writeoff', 'purchase_return') then
    if new.qty >= 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Расход должен списывать со склада документа');
    end if;
  elsif dtype = 'inventory' then
    if new.qty = 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Инвентаризация двигает только склад документа');
    end if;
  elsif dtype = 'transfer' then
    if new.warehouse_id = wh_from then
      if new.qty >= 0 then
        perform os_raise('Со склада-источника перемещение только списывает');
      end if;
    elsif new.warehouse_id = wh_to then
      if new.qty <= 0 then
        perform os_raise('На склад назначения перемещение только приходует');
      end if;
    else
      perform os_raise('Перемещение только между складами документа');
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function os_move_cost() returns trigger as $$
declare
  dtype text;
  src int;
  wh_from int;
  fx numeric;
  line_price numeric;
  have_cost numeric;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  select type, from_warehouse_id, source_id, fx_rate
    into dtype, wh_from, src, fx
    from documents where id = new.document_id;
  fx := coalesce(fx, 1);
  if new.qty < 0 then
    select cost into have_cost
      from stock_balance
      where product_id = new.product_id and warehouse_id = new.warehouse_id;
    if new.cost = 0 then
      new.cost := coalesce(have_cost, 0);
    end if;
  elsif new.qty > 0 then
    if new.cost = 0 then
      if dtype in ('purchase', 'inventory', 'opening') then
        select price into line_price
          from document_lines
          where document_id = new.document_id and product_id = new.product_id
          limit 1;
        if dtype = 'purchase' then
          new.cost := round(coalesce(line_price, 0) * fx, 4);
        else
          new.cost := round(coalesce(line_price, 0), 4);
        end if;
      elsif dtype = 'sale_return' then
        select abs(m.cost) into have_cost
          from stock_moves m
         where m.document_id = src and m.product_id = new.product_id and m.qty < 0
         limit 1;
        if have_cost is null then
          select cost into have_cost
            from stock_balance
           where product_id = new.product_id and warehouse_id = new.warehouse_id;
        end if;
        new.cost := coalesce(have_cost, 0);
      elsif dtype = 'transfer' then
        select cost into have_cost
          from stock_balance
          where product_id = new.product_id and warehouse_id = wh_from;
        new.cost := coalesce(have_cost, 0);
      end if;
    end if;
  end if;
  if new.cost < 0 then
    new.cost := 0;
  end if;
  return new;
end;
$$ language plpgsql;

alter table payments
  add column if not exists origin text not null default 'payment';

alter table payments drop constraint if exists payments_origin_chk;
alter table payments add constraint payments_origin_chk
  check (origin in ('payment', 'opening'));

alter table payments alter column partner_id drop not null;

alter table payments drop constraint if exists payments_partner_origin_chk;
alter table payments add constraint payments_partner_origin_chk check (
  (origin = 'payment' and partner_id is not null)
  or (origin = 'opening' and partner_id is null and document_id is null and kind = 'in')
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
  if new.origin = 'opening' then
    if new.kind is distinct from 'in' or new.partner_id is not null or new.document_id is not null then
      perform os_raise('Начальный остаток денег — приход на счёт, без контрагента');
    end if;
    return new;
  end if;
  if new.partner_id is null then
    perform os_raise('Укажите контрагента');
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

create table if not exists opening_debts (
  id          serial primary key,
  number      text not null unique,
  open_date   date not null,
  partner_id  int not null references counterparties(id),
  side        text not null check (side in ('receivable', 'payable')),
  amount      numeric(14,2) not null check (amount > 0),
  currency    text not null,
  fx_rate     numeric(12,6) not null default 1,
  comment     text not null default '',
  created_at  timestamptz not null default now()
);

alter table opening_debts drop constraint if exists opening_debts_currency_chk;
alter table opening_debts add constraint opening_debts_currency_chk
  check (currency in ('RUB', 'EUR', 'USD', 'KZT'));

drop trigger if exists os_fx_norm_debt_trg on opening_debts;
create trigger os_fx_norm_debt_trg
  before insert or update on opening_debts
  for each row execute procedure os_fx_norm();

create or replace function os_period_debt() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if os_period_closed(old.open_date) then
      perform os_raise('Период закрыт — начальный долг за эту дату удалять нельзя');
    end if;
    return old;
  end if;
  if os_period_closed(new.open_date) then
    perform os_raise('Период закрыт — начальный долг на эту дату ставить нельзя');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_period_debt_trg on opening_debts;
create trigger os_period_debt_trg
  before insert or update or delete on opening_debts
  for each row execute procedure os_period_debt();
