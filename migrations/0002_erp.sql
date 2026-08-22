-- Ось — trade + warehouse core (unowned demo data, no user_id)
create table if not exists warehouses (
  id          serial primary key,
  code        text not null unique,
  name        text not null,
  city        text not null,
  address     text not null default '',
  is_default  boolean not null default false
);

create table if not exists products (
  id              serial primary key,
  sku             text not null unique,
  name            text not null,
  unit            text not null default 'шт',
  category        text not null,
  purchase_price  numeric(14,2) not null default 0,
  sale_price      numeric(14,2) not null default 0,
  vat_rate        numeric(5,2) not null default 12,
  min_stock       numeric(14,3) not null default 0,
  barcode         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists counterparties (
  id          serial primary key,
  name        text not null,
  inn         text not null default '',
  kind        text not null,
  city        text not null default '',
  phone       text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists documents (
  id                  serial primary key,
  type                text not null,
  number              text not null unique,
  doc_date            date not null,
  status              text not null default 'draft',
  warehouse_id        int references warehouses(id),
  from_warehouse_id   int references warehouses(id),
  to_warehouse_id     int references warehouses(id),
  counterparty_id     int references counterparties(id),
  comment             text not null default '',
  posted_at           timestamptz,
  created_at          timestamptz not null default now()
);

create table if not exists document_lines (
  id            serial primary key,
  document_id   int not null references documents(id) on delete cascade,
  product_id    int not null references products(id),
  qty           numeric(14,3) not null,
  price         numeric(14,2) not null,
  amount        numeric(14,2) not null
);

create table if not exists stock_moves (
  id            serial primary key,
  document_id   int not null references documents(id) on delete cascade,
  product_id    int not null references products(id),
  warehouse_id  int not null references warehouses(id),
  qty           numeric(14,3) not null,
  created_at    timestamptz not null default now()
);

create index if not exists documents_date_idx on documents (doc_date desc, id desc);
create index if not exists documents_type_status_idx on documents (type, status);
create index if not exists document_lines_doc_idx on document_lines (document_id);
create index if not exists stock_moves_product_wh_idx on stock_moves (product_id, warehouse_id);
create index if not exists stock_moves_doc_idx on stock_moves (document_id);
create index if not exists products_category_idx on products (category);
create index if not exists counterparties_kind_idx on counterparties (kind);
