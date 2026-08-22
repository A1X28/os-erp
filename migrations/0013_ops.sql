-- Partial receipts already enforced by chain remaining qty.
-- Add returns, pay/refund on them, and owner/staff roles.

alter table documents drop constraint if exists documents_type_chk;
alter table documents add constraint documents_type_chk check (type in (
  'po', 'bill', 'purchase', 'order', 'invoice', 'sale', 'transfer', 'writeoff',
  'sale_return', 'purchase_return'
));

alter table "user" add column if not exists role text not null default 'staff';
alter table "user" drop constraint if exists user_role_chk;
alter table "user" add constraint user_role_chk check (role in ('owner', 'staff'));

update "user"
   set role = 'owner'
 where id = (select id from "user" order by "createdAt" asc, id asc limit 1);

create or replace function os_first_owner() returns trigger as $$
begin
  if not exists (select 1 from "user" where role = 'owner') then
    new.role := 'owner';
  elsif new.role is null then
    new.role := 'staff';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_first_owner_trg on "user";
create trigger os_first_owner_trg
  before insert on "user"
  for each row execute procedure os_first_owner();

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
    elsif new.type = 'sale_return' and src_type <> 'sale' then
      perform os_raise('Возврат от покупателя строится из отгрузки');
    elsif new.type = 'purchase_return' and src_type <> 'purchase' then
      perform os_raise('Возврат поставщику строится из приёмки');
    elsif new.type not in (
      'bill', 'purchase', 'invoice', 'sale', 'sale_return', 'purchase_return'
    ) then
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
    if new.type in (
      'po', 'bill', 'purchase', 'order', 'invoice', 'sale',
      'sale_return', 'purchase_return'
    ) and new.counterparty_id is null then
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

create or replace function os_chain_guard() returns trigger as $$
declare
  src_status text;
  root int;
  ids int[];
  rec record;
  cap numeric;
  used numeric;
  consume text;
begin
  if tg_op = 'UPDATE' and old.status = 'posted' and new.status = 'draft' then
    if exists (
      select 1 from documents c
      where c.status = 'posted'
        and (
          c.source_id = old.id
          or c.source_id in (select x.id from documents x where x.source_id = old.id)
        )
    ) then
      perform os_raise('Сначала отмените связанные документы по цепочке');
    end if;
  end if;

  if new.in_transit and exists (
    select 1 from documents r
    where r.type = 'purchase' and r.status = 'posted'
      and (
        r.source_id = new.id
        or r.source_id in (
          select x.id from documents x
          where x.source_id = new.id or x.id = new.source_id
        )
      )
  ) then
    perform os_raise('Товар уже принят — «ожидается» отмечать нельзя');
  end if;

  if new.status = 'posted' and new.source_id is not null then
    select status into src_status from documents where id = new.source_id;
    if src_status is distinct from 'posted' then
      perform os_raise('Сначала проведите документ-основание');
    end if;
  end if;

  if new.status = 'posted' and new.source_id is not null
     and new.type in ('purchase', 'sale') then
    consume := new.type;
    root := os_chain_root(new.source_id);
    ids := os_chain_ids(new.source_id);
    for rec in
      select product_id, qty from document_lines where document_id = new.id
    loop
      cap := os_line_qty(root, rec.product_id);
      if cap = 0 then
        cap := os_line_qty(new.source_id, rec.product_id);
      end if;
      used := os_posted_qty(ids, rec.product_id, consume, new.id);
      if rec.qty > cap - used + 0.0001 then
        perform os_raise(
          'По основанию осталось ' || (cap - used)::text ||
          ', в документе ' || rec.qty::text ||
          ' — нельзя провести больше, чем заказано'
        );
      end if;
    end loop;
  end if;

  if new.status = 'posted' and new.source_id is not null
     and new.type in ('sale_return', 'purchase_return') then
    for rec in
      select product_id, qty from document_lines where document_id = new.id
    loop
      cap := os_line_qty(new.source_id, rec.product_id);
      select coalesce(sum(l.qty), 0) into used
        from documents d
        join document_lines l on l.document_id = d.id and l.product_id = rec.product_id
       where d.type = new.type
         and d.status = 'posted'
         and d.source_id = new.source_id
         and d.id <> new.id;
      if rec.qty > cap - used + 0.0001 then
        perform os_raise(
          'По документу осталось вернуть ' || (cap - used)::text ||
          ', в возврате ' || rec.qty::text
        );
      end if;
    end loop;
  end if;

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
  if dtype not in ('purchase', 'sale', 'writeoff', 'transfer', 'sale_return', 'purchase_return') then
    perform os_raise('Этот документ не двигает склад');
  end if;
  if dtype in ('purchase', 'sale_return') then
    if new.qty <= 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Приход должен приходовать на склад документа');
    end if;
  elsif dtype in ('sale', 'writeoff', 'purchase_return') then
    if new.qty >= 0 or new.warehouse_id is distinct from wh then
      perform os_raise('Расход должен списывать со склада документа');
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
  line_price numeric;
  have_cost numeric;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  select type, from_warehouse_id, source_id into dtype, wh_from, src
    from documents where id = new.document_id;
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
        new.cost := coalesce(line_price, 0);
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
begin
  if new.document_id is null then
    return new;
  end if;
  select type, counterparty_id, status into dtype, partner, st
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
  if new.kind = 'in' and dtype not in ('order', 'invoice', 'sale', 'purchase_return') then
    perform os_raise('Входящие деньги только к продаже или возврату поставщику');
  end if;
  if new.kind = 'out' and dtype not in ('po', 'bill', 'purchase', 'sale_return') then
    perform os_raise('Исходящие деньги только к закупке или возврату покупателю');
  end if;
  return new;
end;
$$ language plpgsql;
