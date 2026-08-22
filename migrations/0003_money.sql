-- Money: incoming/outgoing payments linked to a partner and optional document.
-- Sale may point at the customer order it was shipped from (source_id).

alter table documents
  add column if not exists source_id int references documents(id) on delete set null;

create index if not exists documents_source_idx on documents (source_id);

create table if not exists payments (
  id            serial primary key,
  kind          text not null,
  number        text not null unique,
  pay_date      date not null,
  partner_id    int not null references counterparties(id),
  document_id   int references documents(id) on delete set null,
  amount        numeric(14,2) not null,
  method        text not null default 'bank',
  comment       text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists payments_partner_idx on payments (partner_id);
create index if not exists payments_doc_idx on payments (document_id);
create index if not exists payments_date_idx on payments (pay_date desc, id desc);
