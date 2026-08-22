-- Chain integrity: a child cannot post before its source, cannot exceed
-- ordered qty, and a parent cannot unpost while posted children exist.

create or replace function os_chain_root(p_id int) returns int as $$
declare
  cur int := p_id;
  src int;
  n int := 0;
begin
  if p_id is null then
    return null;
  end if;
  loop
    select source_id into src from documents where id = cur;
    exit when src is null;
    cur := src;
    n := n + 1;
    exit when n > 8;
  end loop;
  return cur;
end;
$$ language plpgsql;

create or replace function os_chain_ids(p_id int) returns int[] as $$
declare
  root int := os_chain_root(p_id);
begin
  if root is null then
    return array[p_id];
  end if;
  return array(
    select d.id from documents d
    where d.id = root
       or d.source_id = root
       or d.source_id in (select x.id from documents x where x.source_id = root)
  );
end;
$$ language plpgsql;

create or replace function os_line_qty(p_doc int, p_product int) returns numeric as $$
  select coalesce(sum(qty), 0)
  from document_lines
  where document_id = p_doc and product_id = p_product;
$$ language sql;

create or replace function os_posted_qty(
  p_ids int[], p_product int, p_type text, p_except int
) returns numeric as $$
  select coalesce(sum(l.qty), 0)
  from documents d
  join document_lines l on l.document_id = d.id
  where d.id = any(p_ids)
    and d.type = p_type
    and d.status = 'posted'
    and d.id is distinct from p_except
    and l.product_id = p_product;
$$ language sql;

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

  return new;
end;
$$ language plpgsql;

drop trigger if exists os_chain_guard_trg on documents;
create trigger os_chain_guard_trg
  before insert or update on documents
  for each row execute procedure os_chain_guard();
