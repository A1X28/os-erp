-- Purchase/sale chain: in-transit flag. New doc types (po, bill, invoice)
-- are free-form text on documents.type — no enum to alter.

alter table documents
  add column if not exists in_transit boolean not null default false;

create index if not exists documents_in_transit_idx
  on documents (in_transit) where in_transit;
