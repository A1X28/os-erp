alter table counterparties
  add column if not exists address text not null default '',
  add column if not exists bank text not null default '',
  add column if not exists iik text not null default '',
  add column if not exists bik text not null default '';
