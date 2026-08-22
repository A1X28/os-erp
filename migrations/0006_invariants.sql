-- Kernel invariants: invalid stock/money/document states cannot be stored.

update document_lines
  set amount = round(qty * price, 2)
  where amount is distinct from round(qty * price, 2);

alter table products
  drop constraint if exists products_prices_chk,
  drop constraint if exists products_name_chk;
alter table products
  add constraint products_prices_chk check (
    purchase_price >= 0 and sale_price >= 0 and min_stock >= 0 and vat_rate >= 0
  ),
  add constraint products_name_chk check (
    length(trim(sku)) > 0 and length(trim(name)) > 0
  );

alter table counterparties
  drop constraint if exists counterparties_kind_chk;
alter table counterparties
  add constraint counterparties_kind_chk check (kind in ('buyer', 'supplier', 'both'));

alter table warehouses
  drop constraint if exists warehouses_name_chk;
alter table warehouses
  add constraint warehouses_name_chk check (
    length(trim(code)) > 0 and length(trim(name)) > 0
  );

create unique index if not exists warehouses_one_default
  on warehouses ((true)) where is_default;

alter table documents
  drop constraint if exists documents_type_chk,
  drop constraint if exists documents_status_chk,
  drop constraint if exists documents_posted_chk,
  drop constraint if exists documents_transit_chk,
  drop constraint if exists documents_transfer_chk;
alter table documents
  add constraint documents_type_chk check (type in (
    'po', 'bill', 'purchase', 'order', 'invoice', 'sale', 'transfer', 'writeoff'
  )),
  add constraint documents_status_chk check (status in ('draft', 'posted')),
  add constraint documents_posted_chk check (
    (status = 'draft' and posted_at is null)
    or (status = 'posted' and posted_at is not null)
  ),
  add constraint documents_transit_chk check (
    not in_transit or type in ('po', 'bill')
  ),
  add constraint documents_transfer_chk check (
    type <> 'transfer'
    or (
      from_warehouse_id is not null
      and to_warehouse_id is not null
      and from_warehouse_id <> to_warehouse_id
    )
  );

alter table document_lines
  drop constraint if exists document_lines_qty_chk,
  drop constraint if exists document_lines_price_chk,
  drop constraint if exists document_lines_amount_chk;
alter table document_lines
  add constraint document_lines_qty_chk check (qty > 0),
  add constraint document_lines_price_chk check (price >= 0),
  add constraint document_lines_amount_chk check (amount = round(qty * price, 2));

alter table stock_moves
  drop constraint if exists stock_moves_qty_chk;
alter table stock_moves
  add constraint stock_moves_qty_chk check (qty <> 0);

alter table payments
  drop constraint if exists payments_kind_chk,
  drop constraint if exists payments_method_chk,
  drop constraint if exists payments_amount_chk;
alter table payments
  add constraint payments_kind_chk check (kind in ('in', 'out')),
  add constraint payments_method_chk check (method in ('cash', 'bank', 'kaspi')),
  add constraint payments_amount_chk check (amount > 0);

create or replace function os_raise(msg text) returns void as $$
begin
  raise exception '%', msg;
end;
$$ language plpgsql;

create or replace function os_docs_guard() returns trigger as $$
declare
  src_type text;
  line_n int;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      perform os_raise('Проведённый документ нельзя удалить — сначала отмените проведение');
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' and new.status = 'posted' then
    if new.type is distinct from old.type
       or new.warehouse_id is distinct from old.warehouse_id
       or new.from_warehouse_id is distinct from old.from_warehouse_id
       or new.to_warehouse_id is distinct from old.to_warehouse_id
       or new.counterparty_id is distinct from old.counterparty_id
       or new.source_id is distinct from old.source_id
       or new.number is distinct from old.number then
      perform os_raise('Проведённый документ нельзя менять — сначала отмените проведение');
    end if;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' and new.status = 'draft' then
    if exists (select 1 from stock_moves m where m.document_id = old.id) then
      perform os_raise('Сначала сторнируйте движения склада, потом отменяйте проведение');
    end if;
  end if;

  if new.source_id is not null then
    if new.source_id = new.id then
      perform os_raise('Документ не может ссылаться сам на себя');
    end if;
    select type into src_type from documents where id = new.source_id;
    if src_type is null then
      perform os_raise('Документ-основание не найден');
    end if;
    if new.type = 'bill' and src_type <> 'po' then
      perform os_raise('Счёт поставщика строится только из заказа поставщику');
    elsif new.type = 'purchase' and src_type not in ('po', 'bill') then
      perform os_raise('Приёмка строится из заказа или счёта поставщика');
    elsif new.type = 'invoice' and src_type <> 'order' then
      perform os_raise('Счёт покупателю строится только из заказа');
    elsif new.type = 'sale' and src_type not in ('order', 'invoice') then
      perform os_raise('Отгрузка строится из заказа или счёта покупателю');
    elsif new.type not in ('bill', 'purchase', 'invoice', 'sale') then
      perform os_raise('У этого типа документа не бывает основания');
    end if;
  end if;

  if new.status = 'posted' then
    if new.type = 'transfer' then
      if new.from_warehouse_id is null or new.to_warehouse_id is null then
        perform os_raise('Укажите склады перемещения');
      end if;
    elsif new.warehouse_id is null then
      perform os_raise('Укажите склад');
    end if;
    if new.type in ('po', 'bill', 'purchase', 'order', 'invoice', 'sale')
       and new.counterparty_id is null then
      perform os_raise('Укажите контрагента');
    end if;
    select count(*) into line_n from document_lines where document_id = new.id;
    if coalesce(line_n, 0) = 0 then
      perform os_raise('Нельзя провести документ без строк');
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists os_docs_guard_trg on documents;
create trigger os_docs_guard_trg
  before insert or update or delete on documents
  for each row execute procedure os_docs_guard();

create or replace function os_lines_guard() returns trigger as $$
declare
  st text;
  doc_id int;
begin
  doc_id := coalesce(new.document_id, old.document_id);
  select status into st from documents where id = doc_id;
  if st = 'posted' then
    perform os_raise('Нельзя менять строки проведённого документа');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.amount := round(new.qty * new.price, 2);
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_lines_guard_trg on document_lines;
create trigger os_lines_guard_trg
  before insert or update or delete on document_lines
  for each row execute procedure os_lines_guard();

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
  select type, status, warehouse_id, from_warehouse_id, to_warehouse_id
    into dtype, st, wh, wh_from, wh_to
    from documents where id = new.document_id;
  if st is null then
    perform os_raise('Движение склада без документа');
  end if;
  if st <> 'posted' then
    perform os_raise('Движения склада только у проведённого документа');
  end if;
  if dtype not in ('purchase', 'sale', 'writeoff', 'transfer') then
    perform os_raise('Этот документ не двигает склад');
  end if;
  if dtype = 'purchase' then
    if new.qty <= 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Приёмка должна приходовать на склад документа');
    end if;
  elsif dtype in ('sale', 'writeoff') then
    if new.qty >= 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Отгрузка и списание должны списывать со склада документа');
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

drop trigger if exists os_moves_guard_trg on stock_moves;
create trigger os_moves_guard_trg
  before insert or update on stock_moves
  for each row execute procedure os_moves_guard();

create or replace function os_stock_nonneg() returns trigger as $$
declare
  pid int;
  wid int;
  have numeric;
begin
  pid := coalesce(new.product_id, old.product_id);
  wid := coalesce(new.warehouse_id, old.warehouse_id);
  select coalesce(sum(qty), 0) into have
    from stock_moves
    where product_id = pid and warehouse_id = wid;
  if have < 0 then
    perform os_raise('Недостаточно остатка на складе — система не даёт уйти в минус');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_stock_nonneg_trg on stock_moves;
create trigger os_stock_nonneg_trg
  after insert or update or delete on stock_moves
  for each row execute procedure os_stock_nonneg();

create or replace function os_pay_guard() returns trigger as $$
declare
  dtype text;
  partner int;
begin
  if new.document_id is null then
    return new;
  end if;
  select type, counterparty_id into dtype, partner
    from documents where id = new.document_id;
  if dtype is null then
    perform os_raise('Оплата ссылается на несуществующий документ');
  end if;
  if partner is not null and partner is distinct from new.partner_id then
    perform os_raise('Контрагент оплаты не совпадает с документом');
  end if;
  if new.kind = 'in' and dtype not in ('order', 'invoice', 'sale') then
    perform os_raise('Входящая оплата только к заказу, счёту или отгрузке покупателя');
  end if;
  if new.kind = 'out' and dtype not in ('po', 'bill', 'purchase') then
    perform os_raise('Исходящая оплата только к заказу, счёту или приёмке поставщика');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_pay_guard_trg on payments;
create trigger os_pay_guard_trg
  before insert or update on payments
  for each row execute procedure os_pay_guard();
