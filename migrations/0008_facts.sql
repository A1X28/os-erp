-- Fact tables: on-hand qty/cost is a row, not a sum. Payments only on posted
-- documents. Append-only journal of post/unpost/pay.

alter table stock_moves
  add column if not exists cost numeric(14,4) not null default 0;

update stock_moves m
set cost = coalesce((
  select l.price
  from documents d
  join document_lines l
    on l.document_id = d.id and l.product_id = m.product_id
  where d.id = m.document_id and d.type = 'purchase'
  limit 1
), (
  select p.purchase_price from products p where p.id = m.product_id
), 0)
where m.cost = 0;

create table if not exists stock_balance (
  product_id    int not null references products(id),
  warehouse_id  int not null references warehouses(id),
  qty           numeric(14,3) not null default 0,
  cost          numeric(14,4) not null default 0,
  primary key (product_id, warehouse_id),
  constraint stock_balance_qty_chk check (qty >= 0),
  constraint stock_balance_cost_chk check (cost >= 0)
);

insert into stock_balance (product_id, warehouse_id, qty, cost)
select distinct product_id, warehouse_id, 0, 0
from stock_moves
on conflict (product_id, warehouse_id) do nothing;

do $$
declare
  r record;
  have numeric;
  have_cost numeric;
  nq numeric;
  nc numeric;
begin
  for r in select * from stock_moves order by id loop
    select b.qty, b.cost into have, have_cost
    from stock_balance b
    where b.product_id = r.product_id and b.warehouse_id = r.warehouse_id;
    have := coalesce(have, 0);
    have_cost := coalesce(have_cost, 0);
    if r.qty > 0 then
      nq := have + r.qty;
      if nq > 0 then
        nc := round((have * have_cost + r.qty * r.cost) / nq, 4);
      else
        nc := have_cost;
      end if;
    else
      nq := have + r.qty;
      nc := have_cost;
    end if;
    if nq < 0 then
      raise exception 'Недостаточно остатка при пересчёте ядра (товар %, склад %)', r.product_id, r.warehouse_id;
    end if;
    update stock_balance
      set qty = nq, cost = coalesce(nc, 0)
      where product_id = r.product_id and warehouse_id = r.warehouse_id;
  end loop;
end $$;

create or replace function os_move_cost() returns trigger as $$
declare
  dtype text;
  wh_from int;
  line_price numeric;
  have_cost numeric;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  select type, from_warehouse_id into dtype, wh_from
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

drop trigger if exists os_move_cost_trg on stock_moves;
create trigger os_move_cost_trg
  before insert on stock_moves
  for each row execute procedure os_move_cost();

create or replace function os_balance_apply() returns trigger as $$
declare
  pid int;
  wid int;
  dq numeric;
  unit_cost numeric;
  have numeric;
  have_cost numeric;
  nq numeric;
  nc numeric;
begin
  if tg_op = 'INSERT' then
    pid := new.product_id;
    wid := new.warehouse_id;
    dq := new.qty;
    unit_cost := new.cost;
  else
    pid := old.product_id;
    wid := old.warehouse_id;
    dq := -old.qty;
    unit_cost := old.cost;
  end if;

  insert into stock_balance (product_id, warehouse_id, qty, cost)
  values (pid, wid, 0, 0)
  on conflict (product_id, warehouse_id) do nothing;

  select qty, cost into have, have_cost
    from stock_balance
    where product_id = pid and warehouse_id = wid
    for update;
  have := coalesce(have, 0);
  have_cost := coalesce(have_cost, 0);

  if dq > 0 then
    nq := have + dq;
    if nq > 0 then
      nc := round((have * have_cost + dq * unit_cost) / nq, 4);
    else
      nc := have_cost;
    end if;
  else
    nq := have + dq;
    nc := have_cost;
  end if;

  if nq < 0 then
    perform os_raise('Недостаточно остатка на складе — система не даёт уйти в минус');
  end if;

  update stock_balance
    set qty = nq, cost = coalesce(nc, 0)
    where product_id = pid and warehouse_id = wid;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_stock_nonneg_trg on stock_moves;
drop function if exists os_stock_nonneg();

drop trigger if exists os_balance_apply_trg on stock_moves;
create trigger os_balance_apply_trg
  after insert or delete on stock_moves
  for each row execute procedure os_balance_apply();

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
  if new.kind = 'in' and dtype not in ('order', 'invoice', 'sale') then
    perform os_raise('Входящая оплата только к заказу, счёту или отгрузке покупателя');
  end if;
  if new.kind = 'out' and dtype not in ('po', 'bill', 'purchase') then
    perform os_raise('Исходящая оплата только к заказу, счёту или приёмке поставщика');
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists ledger_log (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor_id      text not null default '',
  actor_email   text not null default '',
  action        text not null,
  document_id   int references documents(id) on delete set null,
  payload       jsonb not null default '{}'::jsonb
);

create index if not exists ledger_log_at_idx on ledger_log (at desc, id desc);
create index if not exists ledger_log_doc_idx on ledger_log (document_id);

create or replace function os_actor_id() returns text as $$
  select coalesce(nullif(current_setting('os.actor_id', true), ''), '');
$$ language sql;

create or replace function os_actor_email() returns text as $$
  select coalesce(nullif(current_setting('os.actor_email', true), ''), '');
$$ language sql;

create or replace function os_log_document() returns trigger as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into ledger_log (actor_id, actor_email, action, document_id, payload)
    values (
      os_actor_id(),
      os_actor_email(),
      case when new.status = 'posted' then 'post' else 'unpost' end,
      new.id,
      jsonb_build_object(
        'type', new.type,
        'number', new.number,
        'from', old.status,
        'to', new.status
      )
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_log_document_trg on documents;
create trigger os_log_document_trg
  after update on documents
  for each row execute procedure os_log_document();

create or replace function os_log_payment() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into ledger_log (actor_id, actor_email, action, document_id, payload)
    values (
      os_actor_id(),
      os_actor_email(),
      'pay',
      new.document_id,
      jsonb_build_object(
        'payment_id', new.id,
        'number', new.number,
        'kind', new.kind,
        'amount', new.amount
      )
    );
    return new;
  end if;
  insert into ledger_log (actor_id, actor_email, action, document_id, payload)
  values (
    os_actor_id(),
    os_actor_email(),
    'pay_delete',
    old.document_id,
    jsonb_build_object(
      'payment_id', old.id,
      'number', old.number,
      'kind', old.kind,
      'amount', old.amount
    )
  );
  return old;
end;
$$ language plpgsql;

drop trigger if exists os_log_payment_trg on payments;
create trigger os_log_payment_trg
  after insert or delete on payments
  for each row execute procedure os_log_payment();
