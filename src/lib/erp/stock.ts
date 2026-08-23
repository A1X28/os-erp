import type { Sql } from "@/lib/db";
import { num } from "./format";

const EPS = 1e-9;

export function stockDocs(type: string): boolean {
  return (
    type === "purchase" ||
    type === "sale" ||
    type === "writeoff" ||
    type === "transfer" ||
    type === "sale_return" ||
    type === "purchase_return" ||
    type === "inventory" ||
    type === "opening"
  );
}

export async function chainIds(sql: Sql, start: number): Promise<number[]> {
  const ids = new Set<number>([start]);
  let cur: number | null = start;
  for (let i = 0; i < 6 && cur; i += 1) {
    const rows: { source_id: number | null }[] = await sql.query(
      "select source_id from documents where id = $1",
      [cur],
    );
    const raw = rows[0]?.source_id;
    const src: number | null = raw == null ? null : num(raw);
    if (src && !ids.has(src)) {
      ids.add(src);
      cur = src;
    } else {
      cur = null;
    }
  }
  let root = start;
  for (const id of ids) {
    const rows: { source_id: number | null }[] = await sql.query(
      "select source_id from documents where id = $1",
      [id],
    );
    if (rows[0]?.source_id == null) root = id;
  }
  const down: { id: number }[] = await sql.query(
    `select id from documents
     where id = $1
        or source_id = $1
        or source_id in (select d.id from documents d where d.source_id = $1)`,
    [root],
  );
  for (const row of down) ids.add(row.id);
  return [...ids];
}

export async function findSaleInChain(sql: Sql, start: number): Promise<number | null> {
  const ids = await chainIds(sql, start);
  if (ids.length === 0) return null;
  for (const id of ids) {
    const rows = await sql<{ id: number; type: string }>`
      select id, type from documents where id = ${id}
    `;
    if (rows[0]?.type === "sale") return rows[0].id;
  }
  return null;
}

export async function onHand(
  sql: Sql,
  productId: number,
  warehouseId: number,
): Promise<number> {
  const rows = await sql<{ qty: unknown }>`
    select coalesce((
      select qty from stock_balance
      where product_id = ${productId} and warehouse_id = ${warehouseId}
    ), 0) as qty
  `;
  return num(rows[0]?.qty);
}

/** Posted customer orders (and standalone invoices) minus already shipped. */
export async function reservedQty(
  sql: Sql,
  productId: number,
  warehouseId: number,
  exceptChainStart?: number | null,
): Promise<number> {
  const rows = await sql<{ reserved: unknown }>`
    select coalesce(sum(greatest(l.qty - coalesce(ship.qty, 0), 0)), 0) as reserved
    from documents d
    join document_lines l on l.document_id = d.id
    left join lateral (
      select coalesce(sum(ls.qty), 0) as qty
      from documents s
      join document_lines ls
        on ls.document_id = s.id and ls.product_id = l.product_id
      where s.type = 'sale'
        and s.status = 'posted'
        and (
          s.source_id = d.id
          or s.source_id in (select i.id from documents i where i.source_id = d.id)
        )
    ) ship on true
    where d.status = 'posted'
      and d.warehouse_id = ${warehouseId}
      and l.product_id = ${productId}
      and (
        d.type = 'order'
        or (d.type = 'invoice' and d.source_id is null)
      )
  `;
  let reserved = num(rows[0]?.reserved);
  if (exceptChainStart == null) return Math.max(0, reserved);

  const exceptIds = await chainIds(sql, exceptChainStart);
  if (exceptIds.length === 0) return Math.max(0, reserved);

  const self = await sql.query<{ reserved: unknown }>(
    `select coalesce(sum(greatest(l.qty - coalesce(ship.qty, 0), 0)), 0) as reserved
     from documents d
     join document_lines l on l.document_id = d.id
     left join lateral (
       select coalesce(sum(ls.qty), 0) as qty
       from documents s
       join document_lines ls
         on ls.document_id = s.id and ls.product_id = l.product_id
       where s.type = 'sale'
         and s.status = 'posted'
         and (
           s.source_id = d.id
           or s.source_id in (select i.id from documents i where i.source_id = d.id)
         )
     ) ship on true
     where d.status = 'posted'
       and d.warehouse_id = $1
       and l.product_id = $2
       and d.id = any($3::int[])
       and (
         d.type = 'order'
         or (d.type = 'invoice' and d.source_id is null)
       )`,
    [warehouseId, productId, exceptIds],
  );
  reserved -= num(self[0]?.reserved);
  return Math.max(0, reserved);
}

export async function incomingQty(
  sql: Sql,
  productId: number,
  warehouseId: number,
): Promise<number> {
  const rows = await sql<{ qty: unknown }>`
    select coalesce(sum(greatest(l.qty - coalesce(recv.qty, 0), 0)), 0) as qty
    from documents d
    join document_lines l on l.document_id = d.id
    left join lateral (
      select coalesce(sum(lp.qty), 0) as qty
      from documents p
      join document_lines lp
        on lp.document_id = p.id and lp.product_id = l.product_id
      where p.type = 'purchase'
        and p.status = 'posted'
        and (
          p.source_id = d.id
          or p.source_id in (select b.id from documents b where b.source_id = d.id)
        )
    ) recv on true
    where d.type in ('po', 'bill')
      and (d.status = 'posted' or d.in_transit)
      and d.warehouse_id = ${warehouseId}
      and l.product_id = ${productId}
  `;
  return num(rows[0]?.qty);
}

export async function availableQty(
  sql: Sql,
  productId: number,
  warehouseId: number,
  releaseSourceId?: number | null,
): Promise<{ onHand: number; reserved: number; incoming: number; available: number }> {
  const [hand, reserved, incoming] = await Promise.all([
    onHand(sql, productId, warehouseId),
    reservedQty(sql, productId, warehouseId, releaseSourceId ?? null),
    incomingQty(sql, productId, warehouseId),
  ]);
  return {
    onHand: hand,
    reserved,
    incoming,
    available: Math.max(0, Math.round((hand - reserved) * 1000) / 1000),
  };
}

export function notEnough(have: number, need: number): boolean {
  return have + EPS < need;
}

export async function postedInChain(
  sql: Sql,
  start: number,
  productId: number,
  type: string,
): Promise<number> {
  const ids = await chainIds(sql, start);
  if (ids.length === 0) return 0;
  const rows = await sql.query<{ qty: unknown }>(
    `select coalesce(sum(l.qty), 0) as qty
     from documents s
     join document_lines l on l.document_id = s.id
     where s.type = $1
       and s.status = 'posted'
       and l.product_id = $2
       and s.id = any($3::int[])`,
    [type, productId, ids],
  );
  return num(rows[0]?.qty);
}

export async function shippedInChain(
  sql: Sql,
  start: number,
  productId: number,
): Promise<number> {
  return postedInChain(sql, start, productId, "sale");
}

export async function remainingForFollow(
  sql: Sql,
  start: number,
  consumeType: string,
): Promise<number> {
  const lines = await sql<{ product_id: number; qty: unknown }>`
    select product_id, qty from document_lines where document_id = ${start}
  `;
  let open = 0;
  for (const line of lines) {
    const used = await postedInChain(sql, start, num(line.product_id), consumeType);
    open += Math.max(0, num(line.qty) - used);
  }
  return Math.round(open * 1000) / 1000;
}
