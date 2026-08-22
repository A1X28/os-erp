-- Inventory count: fact on the line, kernel writes surplus/shortage moves.

alter table documents drop constraint if exists documents_type_chk;
alter table documents add constraint documents_type_chk check (type in (
  'po', 'bill', 'purchase', 'order', 'invoice', 'sale', 'transfer', 'writeoff',
  'sale_return', 'purchase_return', 'inventory'
));

alter table document_lines
  add column if not exists expected_qty numeric(14,3);

alter table document_lines
  drop constraint if exists document_lines_qty_chk;
alter table document_lines
  add constraint document_lines_qty_chk check (qty >= 0);

alter table document_lines
  drop constraint if exists document_lines_expected_chk;
alter table document_lines
  add constraint document_lines_expected_chk check (
    expected_qty is null or expected_qty >= 0
  );

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

create or replace function os_fx_norm() returns trigger as $$
begin
  new.currency := upper(new.currency);
  if tg_table_name = 'documents' and new.type = 'inventory' then
    new.currency := os_base_currency();
    new.fx_rate := 1;
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
    'sale_return', 'purchase_return', 'inventory'
  ) then
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
      if dtype in ('purchase', 'inventory') then
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

create or replace function os_inventory_apply() returns trigger as $$
declare
  rec record;
  have numeric;
  reserved numeric;
  delta numeric;
begin
  if new.type <> 'inventory' then
    return new;
  end if;
  if new.status <> 'posted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'posted' then
    return new;
  end if;

  if new.warehouse_id is null then
    perform os_raise('Укажите склад');
  end if;
  if exists (
    select 1 from document_lines
    where document_id = new.id
    group by product_id having count(*) > 1
  ) then
    perform os_raise('В инвентаризации товар только один раз');
  end if;

  for rec in
    select l.product_id, l.qty as counted, p.name
    from document_lines l
    join products p on p.id = l.product_id
    where l.document_id = new.id
  loop
    insert into stock_balance (product_id, warehouse_id, qty, cost)
    values (rec.product_id, new.warehouse_id, 0, 0)
    on conflict (product_id, warehouse_id) do nothing;

    select qty into have
      from stock_balance
     where product_id = rec.product_id and warehouse_id = new.warehouse_id
     for update;
    have := coalesce(have, 0);

    select coalesce(sum(greatest(l.qty - coalesce(ship.qty, 0), 0)), 0)
      into reserved
      from documents d
      join document_lines l on l.document_id = d.id
      left join lateral (
        select coalesce(sum(ls.qty), 0) as qty
        from documents s
        join document_lines ls
          on ls.document_id = s.id and ls.product_id = l.product_id
        where s.type = 'sale' and s.status = 'posted'
          and (
            s.source_id = d.id
            or s.source_id in (select i.id from documents i where i.source_id = d.id)
          )
      ) ship on true
     where d.status = 'posted'
       and d.warehouse_id = new.warehouse_id
       and l.product_id = rec.product_id
       and (
         d.type = 'order'
         or (d.type = 'invoice' and d.source_id is null)
       );
    reserved := coalesce(reserved, 0);

    if rec.counted + 0.0001 < reserved then
      perform os_raise(
        rec.name || ': факт ' || rec.counted::text ||
        ' ниже резерва по заказам ' || reserved::text ||
        ' — сначала снимите резерв'
      );
    end if;

    delta := rec.counted - have;
    if abs(delta) < 0.0000001 then
      continue;
    end if;
    insert into stock_moves (document_id, product_id, warehouse_id, qty)
    values (new.id, rec.product_id, new.warehouse_id, delta);
  end loop;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_inventory_apply_trg on documents;
create trigger os_inventory_apply_trg
  after insert or update of status on documents
  for each row execute procedure os_inventory_apply();
