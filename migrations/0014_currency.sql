-- Multi-currency: document/payment in own currency, stock and reports in base.
-- fx_rate = base units for 1 unit of the document currency.

alter table company_profile
  add column if not exists base_currency text not null default 'RUB';

update company_profile set base_currency = 'RUB' where id = 1;

alter table company_profile drop constraint if exists company_base_currency_chk;
alter table company_profile add constraint company_base_currency_chk
  check (base_currency in ('RUB', 'EUR', 'USD', 'KZT'));

alter table documents
  add column if not exists currency text not null default 'RUB',
  add column if not exists fx_rate numeric(18,6) not null default 1;

alter table payments
  add column if not exists currency text not null default 'RUB',
  add column if not exists fx_rate numeric(18,6) not null default 1;

alter table documents drop constraint if exists documents_currency_chk;
alter table documents add constraint documents_currency_chk
  check (currency in ('RUB', 'EUR', 'USD', 'KZT'));
alter table documents drop constraint if exists documents_fx_chk;
alter table documents add constraint documents_fx_chk check (fx_rate > 0);

alter table payments drop constraint if exists payments_currency_chk;
alter table payments add constraint payments_currency_chk
  check (currency in ('RUB', 'EUR', 'USD', 'KZT'));
alter table payments drop constraint if exists payments_fx_chk;
alter table payments add constraint payments_fx_chk check (fx_rate > 0);

create or replace function os_base_currency() returns text as $$
  select coalesce((select base_currency from company_profile where id = 1), 'RUB');
$$ language sql stable;

create or replace function os_fx_norm() returns trigger as $$
begin
  new.currency := upper(new.currency);
  if new.currency = os_base_currency() then
    new.fx_rate := 1;
  end if;
  if new.fx_rate is null or new.fx_rate <= 0 then
    perform os_raise('Курс должен быть больше нуля');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_fx_norm_docs_trg on documents;
create trigger os_fx_norm_docs_trg
  before insert or update on documents
  for each row execute procedure os_fx_norm();

drop trigger if exists os_fx_norm_pay_trg on payments;
create trigger os_fx_norm_pay_trg
  before insert or update on payments
  for each row execute procedure os_fx_norm();

create or replace function os_fx_lock() returns trigger as $$
begin
  if tg_op = 'UPDATE' and old.status = 'posted' and new.status = 'posted' then
    if new.currency is distinct from old.currency
       or new.fx_rate is distinct from old.fx_rate then
      perform os_raise('Курс и валюту проведённого документа менять нельзя');
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_fx_lock_trg on documents;
create trigger os_fx_lock_trg
  before update on documents
  for each row execute procedure os_fx_lock();

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
      if dtype = 'purchase' then
        select price into line_price
          from document_lines
          where document_id = new.document_id and product_id = new.product_id
          limit 1;
        new.cost := round(coalesce(line_price, 0) * fx, 4);
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

create or replace function os_pay_guard() returns trigger as $$
declare
  dtype text;
  partner int;
  st text;
  dcur text;
begin
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
