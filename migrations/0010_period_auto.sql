-- Auto-close elapsed months after a grace window. Asia/Almaty calendar.

alter table closed_periods
  add column if not exists auto boolean not null default false;

create table if not exists period_settings (
  id          int primary key default 1 check (id = 1),
  auto_close  boolean not null default true,
  grace_days  int not null default 5,
  constraint period_settings_grace_chk check (grace_days between 0 and 31)
);

insert into period_settings (id, auto_close, grace_days)
values (1, true, 5)
on conflict (id) do nothing;

create or replace function os_almaty_today() returns date as $$
begin
  begin
    return (timezone('Asia/Almaty', now()))::date;
  exception when others then
    return current_date;
  end;
end;
$$ language plpgsql stable;

create or replace function os_month_last_day(p_year int, p_month int) returns date as $$
  select (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
$$ language sql immutable;

create or replace function os_auto_close_periods() returns int as $$
declare
  enabled boolean;
  grace int;
  today date;
  latest_y int;
  latest_m int;
  y int;
  m int;
  n int := 0;
  last_d date;
  prev_y int;
  prev_m int;
begin
  perform pg_advisory_xact_lock(hashtext('os-period-close'));

  select s.auto_close, s.grace_days into enabled, grace
    from period_settings s where s.id = 1;
  if not coalesce(enabled, true) then
    return 0;
  end if;
  grace := coalesce(grace, 5);
  today := os_almaty_today();

  prev_y := extract(year from today)::int;
  prev_m := extract(month from today)::int - 1;
  if prev_m = 0 then
    prev_m := 12;
    prev_y := prev_y - 1;
  end if;

  select c.year, c.month into latest_y, latest_m
    from closed_periods c
    order by c.year desc, c.month desc
    limit 1;

  if latest_y is null then
    last_d := os_month_last_day(prev_y, prev_m);
    if today >= last_d + grace then
      insert into closed_periods (year, month, closed_by, closed_email, auto)
      values (prev_y, prev_m, 'system', 'авто', true)
      on conflict do nothing;
      if found then
        insert into ledger_log (actor_id, actor_email, action, payload)
        values (
          'system', 'авто', 'period_close',
          jsonb_build_object('year', prev_y, 'month', prev_m, 'auto', true)
        );
        n := 1;
      end if;
    end if;
    return n;
  end if;

  y := latest_y;
  m := latest_m;
  loop
    m := m + 1;
    if m = 13 then
      m := 1;
      y := y + 1;
    end if;
    if y > extract(year from today)::int
       or (y = extract(year from today)::int and m >= extract(month from today)::int) then
      exit;
    end if;
    last_d := os_month_last_day(y, m);
    if today < last_d + grace then
      exit;
    end if;
    insert into closed_periods (year, month, closed_by, closed_email, auto)
    values (y, m, 'system', 'авто', true)
    on conflict do nothing;
    if found then
      insert into ledger_log (actor_id, actor_email, action, payload)
      values (
        'system', 'авто', 'period_close',
        jsonb_build_object('year', y, 'month', m, 'auto', true)
      );
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$ language plpgsql;
