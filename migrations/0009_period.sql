-- Close a month: books for that date cannot be posted, unposted, or paid.

create table if not exists closed_periods (
  year         int not null,
  month        int not null,
  closed_at    timestamptz not null default now(),
  closed_by    text not null default '',
  closed_email text not null default '',
  primary key (year, month),
  constraint closed_periods_month_chk check (month between 1 and 12),
  constraint closed_periods_year_chk check (year between 2000 and 2100)
);

create or replace function os_period_closed(p_date date) returns boolean as $$
  select exists (
    select 1 from closed_periods c
    where c.year = extract(year from p_date)::int
      and c.month = extract(month from p_date)::int
  );
$$ language sql stable;

create or replace function os_period_docs() returns trigger as $$
declare
  d date;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' and os_period_closed(old.doc_date) then
      perform os_raise('Период закрыт — документ нельзя трогать');
    end if;
    return old;
  end if;

  d := new.doc_date;
  if tg_op = 'INSERT' and os_period_closed(d) then
    perform os_raise('Период закрыт — документ на эту дату ставить нельзя');
  end if;

  if tg_op = 'UPDATE' then
    if os_period_closed(old.doc_date) or os_period_closed(new.doc_date) then
      if old.status is distinct from new.status then
        perform os_raise('Период закрыт — провести или отменить нельзя');
      end if;
      if old.doc_date is distinct from new.doc_date then
        perform os_raise('Период закрыт — дату документа менять нельзя');
      end if;
      if old.in_transit is distinct from new.in_transit then
        perform os_raise('Период закрыт — ожидание по этой дате менять нельзя');
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_period_docs_trg on documents;
create trigger os_period_docs_trg
  before insert or update or delete on documents
  for each row execute procedure os_period_docs();

create or replace function os_period_pay() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if os_period_closed(old.pay_date) then
      perform os_raise('Период закрыт — оплату за эту дату удалять нельзя');
    end if;
    return old;
  end if;
  if os_period_closed(new.pay_date) then
    perform os_raise('Период закрыт — оплату на эту дату ставить нельзя');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_period_pay_trg on payments;
create trigger os_period_pay_trg
  before insert or update or delete on payments
  for each row execute procedure os_period_pay();
