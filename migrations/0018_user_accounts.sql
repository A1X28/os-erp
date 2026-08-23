-- Accounts are a directory the user fills. Kaspi is a name, not a kind.

update money_accounts set is_default = false where kind = 'kaspi';
update money_accounts set kind = 'bank' where kind = 'kaspi';
update payments set method = 'bank' where method = 'kaspi';

alter table money_accounts drop constraint if exists money_accounts_kind_check;
alter table money_accounts drop constraint if exists money_accounts_kind_chk;
alter table money_accounts add constraint money_accounts_kind_chk
  check (kind in ('cash', 'bank'));

alter table payments drop constraint if exists payments_method_chk;
alter table payments add constraint payments_method_chk
  check (method in ('cash', 'bank'));

create or replace function os_account_default() returns trigger as $$
begin
  if not new.is_default then
    if not exists (
      select 1 from money_accounts where kind = new.kind and is_default
    ) then
      new.is_default := true;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_account_default_trg on money_accounts;
create trigger os_account_default_trg
  before insert on money_accounts
  for each row execute procedure os_account_default();

create or replace function os_account_guard() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind
       or new.currency is distinct from old.currency then
      if exists (select 1 from payments where account_id = old.id)
         or exists (
           select 1 from money_transfers
            where from_id = old.id or to_id = old.id
         ) then
        perform os_raise('Тип и валюту счёта с оборотом менять нельзя');
      end if;
    end if;
    if length(trim(new.name)) = 0 then
      perform os_raise('Название счёта не может быть пустым');
    end if;
    return new;
  end if;
  if exists (select 1 from payments where account_id = old.id) then
    perform os_raise('Счёт нельзя удалить — по нему есть оплаты');
  end if;
  if exists (
    select 1 from money_transfers where from_id = old.id or to_id = old.id
  ) then
    perform os_raise('Счёт нельзя удалить — по нему есть перемещения');
  end if;
  if exists (
    select 1 from money_balance where account_id = old.id and amount <> 0
  ) then
    perform os_raise('Счёт нельзя удалить — на нём есть деньги');
  end if;
  delete from money_balance where account_id = old.id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists os_account_guard_trg on money_accounts;
create trigger os_account_guard_trg
  before update or delete on money_accounts
  for each row execute procedure os_account_guard();

delete from money_accounts a
 where a.name in ('Касса', 'Расчётный счёт', 'Kaspi', 'Счёт EUR')
   and not exists (select 1 from payments p where p.account_id = a.id)
   and not exists (
     select 1 from money_transfers t
      where t.from_id = a.id or t.to_id = a.id
   )
   and not exists (
     select 1 from money_balance b
      where b.account_id = a.id and b.amount <> 0
   );
