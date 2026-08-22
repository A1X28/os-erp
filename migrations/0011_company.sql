-- Single-row company profile: requisites and VAT for print/docs.

create table if not exists company_profile (
  id           int primary key default 1 check (id = 1),
  name         text not null default 'Севертрейд',
  bin          text not null default '',
  address      text not null default '',
  phone        text not null default '',
  bank         text not null default '',
  iik          text not null default '',
  bik          text not null default '',
  vat_enabled  boolean not null default true,
  vat_rate     numeric(5,2) not null default 12,
  constraint company_vat_rate_chk check (vat_rate >= 0 and vat_rate <= 100)
);

insert into company_profile (id, name, vat_enabled, vat_rate)
values (1, 'Севертрейд', true, 12)
on conflict (id) do nothing;
