-- Turnover tax knobs on the company profile (cash-basis estimate).

alter table company_profile
  add column if not exists tax_rate numeric(5,2) not null default 6,
  add column if not exists tax_extra_rate numeric(5,2) not null default 1,
  add column if not exists tax_threshold numeric(14,2) not null default 300000;

update company_profile
   set tax_rate = 6, tax_extra_rate = 1, tax_threshold = 300000
 where id = 1
   and tax_rate = 6;
