import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { withDb } from "./db";
import { num } from "./format";
import { DOC_TYPE_SHORT, FOLLOW_TO } from "./labels";
import type {
  DashboardData,
  DocStatus,
  DocType,
  DocumentDetail,
  DocumentLine,
  DocumentSummary,
  Employee,
  Partner,
  PartnerKind,
  PayKind,
  PayMethod,
  Payment,
  PeriodKey,
  Product,
  ReportData,
  StockMove,
  StockRow,
  TransitRow,
  Warehouse,
} from "./types";
import { DOC_TYPES } from "./types";

function periodSql(period: PeriodKey): { from: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const months = [
    "январь",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
  ];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: iso(from), label: "Последние 30 дней" };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3);
    const from = new Date(y, q * 3, 1);
    return { from: iso(from), label: `${q + 1} квартал ${y}` };
  }
  const from = new Date(y, m, 1);
  const label = `${months[m]} ${y}`;
  return { from: iso(from), label: label.charAt(0).toUpperCase() + label.slice(1) };
}

const periodSchema = z.enum(["month", "30d", "quarter"]);

function mapWarehouse(r: Record<string, unknown>): Warehouse {
  return {
    id: num(r.id),
    code: String(r.code),
    name: String(r.name),
    city: String(r.city),
    address: String(r.address ?? ""),
    isDefault: Boolean(r.is_default),
  };
}

function mapProduct(r: Record<string, unknown>): Product {
  return {
    id: num(r.id),
    sku: String(r.sku),
    name: String(r.name),
    unit: String(r.unit),
    category: String(r.category),
    purchasePrice: num(r.purchase_price),
    salePrice: num(r.sale_price),
    vatRate: num(r.vat_rate),
    minStock: num(r.min_stock),
    barcode: r.barcode == null ? null : String(r.barcode),
    isActive: r.is_active === false ? false : true,
    stock: num(r.stock),
  };
}

function mapPartner(r: Record<string, unknown>): Partner {
  return {
    id: num(r.id),
    name: String(r.name),
    inn: String(r.inn ?? ""),
    kind: String(r.kind) as PartnerKind,
    city: String(r.city ?? ""),
    phone: String(r.phone ?? ""),
  };
}

function mapPayment(r: Record<string, unknown>): Payment {
  return {
    id: num(r.id),
    kind: String(r.kind) as PayKind,
    number: String(r.number),
    payDate: String(r.pay_date).slice(0, 10),
    partnerId: num(r.partner_id),
    partnerName: String(r.partner_name ?? ""),
    documentId: r.document_id == null ? null : num(r.document_id),
    documentNumber: r.document_number == null ? null : String(r.document_number),
    documentType: r.document_type == null ? null : (String(r.document_type) as DocType),
    amount: num(r.amount),
    method: String(r.method) as PayMethod,
    comment: String(r.comment ?? ""),
  };
}

function mapDocSummary(r: Record<string, unknown>): DocumentSummary {
  return {
    id: num(r.id),
    type: String(r.type) as DocType,
    number: String(r.number),
    docDate: String(r.doc_date).slice(0, 10),
    status: String(r.status) as DocStatus,
    warehouseName: r.warehouse_name == null ? null : String(r.warehouse_name),
    partnerName: r.partner_name == null ? null : String(r.partner_name),
    amount: num(r.amount),
    linesCount: num(r.lines_count),
  };
}

const DOC_SELECT = `
  d.id, d.type, d.number, d.doc_date, d.status,
  coalesce(w.name, wf.name, wt.name) as warehouse_name,
  c.name as partner_name,
  coalesce((select sum(l.amount) from document_lines l where l.document_id = d.id), 0) as amount,
  coalesce((select count(*) from document_lines l where l.document_id = d.id), 0) as lines_count
`;

export const listWarehouses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<Warehouse[]> => {
    const sql = await withDb();
    const rows = await sql<Record<string, unknown>>`
      select id, code, name, city, address, is_default
      from warehouses
      order by is_default desc, id
    `;
    return rows.map(mapWarehouse);
  },
);

export const listProducts = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      category: z.string().optional(),
    }),
  )
  .middleware([authMiddleware]).handler(async ({ data }): Promise<Product[]> => {
    const sql = await withDb();
    const q = data.q?.trim() ? `%${data.q.trim().toLowerCase()}%` : null;
    const category = data.category?.trim() || null;
    const rows = await sql<Record<string, unknown>>`
      select p.*, coalesce(s.stock, 0) as stock
      from products p
      left join (
        select product_id, sum(qty) as stock from stock_moves group by product_id
      ) s on s.product_id = p.id
      where (${q}::text is null
        or lower(p.name) like ${q}
        or lower(p.sku) like ${q}
        or coalesce(p.barcode, '') like ${q})
        and (${category}::text is null or p.category = ${category})
      order by p.name
    `;
    return rows.map(mapProduct);
  });

export const getProduct = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .middleware([authMiddleware]).handler(async ({ data }) => {
    const sql = await withDb();
    const rows = await sql<Record<string, unknown>>`
      select p.*, coalesce(s.stock, 0) as stock
      from products p
      left join (
        select product_id, sum(qty) as stock from stock_moves group by product_id
      ) s on s.product_id = p.id
      where p.id = ${data.id}
    `;
    if (!rows[0]) throw new Error("Товар не найден");
    const product = mapProduct(rows[0]);
    const byWh = await sql<{
      warehouse_id: number;
      name: string;
      city: string;
      qty: unknown;
    }>`
      select w.id as warehouse_id, w.name, w.city, coalesce(sum(m.qty), 0) as qty
      from warehouses w
      left join stock_moves m on m.warehouse_id = w.id and m.product_id = ${data.id}
      group by w.id, w.name, w.city
      order by w.id
    `;
    const moves = await sql<Record<string, unknown>>`
      select m.id, m.qty, m.created_at, d.number, d.type, d.doc_date, w.name as warehouse_name
      from stock_moves m
      join documents d on d.id = m.document_id
      join warehouses w on w.id = m.warehouse_id
      where m.product_id = ${data.id}
      order by d.doc_date desc, m.id desc
      limit 40
    `;
    return {
      product,
      byWarehouse: byWh.map((r) => ({
        warehouseId: num(r.warehouse_id),
        name: r.name,
        city: r.city,
        qty: num(r.qty),
      })),
      moves: moves.map((r) => ({
        id: num(r.id),
        qty: num(r.qty),
        number: String(r.number),
        type: String(r.type) as DocType,
        docDate: String(r.doc_date).slice(0, 10),
        warehouseName: String(r.warehouse_name),
      })),
    };
  });

const productInput = z.object({
  id: z.number().optional(),
  sku: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  category: z.string().min(1),
  purchasePrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  minStock: z.number().nonnegative(),
  barcode: z.string().optional(),
});

export const saveProduct = createServerFn({ method: "POST" })
  .validator(productInput)
  .middleware([authMiddleware]).handler(async ({ data }): Promise<Product> => {
    const sql = await withDb();
    const barcode = data.barcode?.trim() || null;
    if (data.id) {
      const rows = await sql<Record<string, unknown>>`
        update products set
          sku = ${data.sku.trim()},
          name = ${data.name.trim()},
          unit = ${data.unit},
          category = ${data.category},
          purchase_price = ${data.purchasePrice},
          sale_price = ${data.salePrice},
          min_stock = ${data.minStock},
          barcode = ${barcode}
        where id = ${data.id}
        returning *
      `;
      if (!rows[0]) throw new Error("Товар не найден");
      return mapProduct({ ...rows[0], stock: 0 });
    }
    const rows = await sql<Record<string, unknown>>`
      insert into products (
        sku, name, unit, category, purchase_price, sale_price, min_stock, barcode
      ) values (
        ${data.sku.trim()}, ${data.name.trim()}, ${data.unit}, ${data.category},
        ${data.purchasePrice}, ${data.salePrice}, ${data.minStock}, ${barcode}
      )
      returning *
    `;
    return mapProduct({ ...rows[0], stock: 0 });
  });

export const listPartners = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      kind: z.enum(["buyer", "supplier", "both", "all"]).optional(),
    }),
  )
  .middleware([authMiddleware]).handler(async ({ data }): Promise<Partner[]> => {
    const sql = await withDb();
    const q = data.q?.trim() ? `%${data.q.trim().toLowerCase()}%` : null;
    const kind = data.kind && data.kind !== "all" ? data.kind : null;
    const rows = await sql<Record<string, unknown>>`
      select * from counterparties
      where (${q}::text is null
        or lower(name) like ${q}
        or inn like ${q})
        and (
          ${kind}::text is null
          or kind = ${kind}
          or kind = 'both'
        )
      order by name
    `;
    return rows.map(mapPartner);
  });

const partnerInput = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  inn: z.string().optional(),
  kind: z.enum(["buyer", "supplier", "both"]),
  city: z.string().optional(),
  phone: z.string().optional(),
});

export const savePartner = createServerFn({ method: "POST" })
  .validator(partnerInput)
  .middleware([authMiddleware]).handler(async ({ data }): Promise<Partner> => {
    const sql = await withDb();
    const inn = data.inn?.trim() ?? "";
    const city = data.city?.trim() ?? "";
    const phone = data.phone?.trim() ?? "";
    if (data.id) {
      const rows = await sql<Record<string, unknown>>`
        update counterparties set
          name = ${data.name.trim()},
          inn = ${inn},
          kind = ${data.kind},
          city = ${city},
          phone = ${phone}
        where id = ${data.id}
        returning *
      `;
      if (!rows[0]) throw new Error("Контрагент не найден");
      return mapPartner(rows[0]);
    }
    const rows = await sql<Record<string, unknown>>`
      insert into counterparties (name, inn, kind, city, phone)
      values (${data.name.trim()}, ${inn}, ${data.kind}, ${city}, ${phone})
      returning *
    `;
    return mapPartner(rows[0]);
  });

export const listStock = createServerFn({ method: "GET" })
  .validator(
    z.object({
      warehouseId: z.number().optional(),
      q: z.string().optional(),
      lowOnly: z.boolean().optional(),
    }),
  )
  .middleware([authMiddleware]).handler(async ({ data }): Promise<StockRow[]> => {
    const sql = await withDb();
    const q = data.q?.trim() ? `%${data.q.trim().toLowerCase()}%` : null;
    const warehouseId = data.warehouseId ?? null;
    const lowOnly = data.lowOnly ?? false;
    const rows = await sql<Record<string, unknown>>`
      select
        p.id as product_id, p.sku, p.name, p.unit, p.category, p.min_stock,
        p.purchase_price, p.sale_price,
        w.id as warehouse_id, w.name as warehouse_name,
        coalesce(sum(m.qty), 0) as qty,
        coalesce((
          select sum(m2.qty) from stock_moves m2 where m2.product_id = p.id
        ), 0) as stock_total
      from products p
      cross join warehouses w
      left join stock_moves m
        on m.product_id = p.id and m.warehouse_id = w.id
      where (${warehouseId}::int is null or w.id = ${warehouseId})
        and (${q}::text is null or lower(p.name) like ${q} or lower(p.sku) like ${q})
      group by p.id, p.sku, p.name, p.unit, p.category, p.min_stock,
               p.purchase_price, p.sale_price, w.id, w.name
      having (${lowOnly} = false or coalesce((
        select sum(m3.qty) from stock_moves m3 where m3.product_id = p.id
      ), 0) <= p.min_stock)
      order by p.name, w.id
    `;
    return rows.map((r) => {
      const qty = num(r.qty);
      const purchasePrice = num(r.purchase_price);
      return {
        productId: num(r.product_id),
        sku: String(r.sku),
        name: String(r.name),
        unit: String(r.unit),
        category: String(r.category),
        minStock: num(r.min_stock),
        purchasePrice,
        salePrice: num(r.sale_price),
        warehouseId: num(r.warehouse_id),
        warehouseName: String(r.warehouse_name),
        qty,
        value: qty * purchasePrice,
        stockTotal: num(r.stock_total),
      };
    });
  });

export const listDocuments = createServerFn({ method: "GET" })
  .validator(
    z.object({
      q: z.string().optional(),
      type: z.enum(["all", ...DOC_TYPES]).optional(),
      status: z.enum(["draft", "posted", "all"]).optional(),
    }),
  )
  .middleware([authMiddleware]).handler(async ({ data }): Promise<DocumentSummary[]> => {
    const sql = await withDb();
    const q = data.q?.trim() ? `%${data.q.trim().toLowerCase()}%` : null;
    const type = data.type && data.type !== "all" ? data.type : null;
    const status = data.status && data.status !== "all" ? data.status : null;
    const rows = await sql.query<Record<string, unknown>>(
      `select ${DOC_SELECT}
       from documents d
       left join warehouses w on w.id = d.warehouse_id
       left join warehouses wf on wf.id = d.from_warehouse_id
       left join warehouses wt on wt.id = d.to_warehouse_id
       left join counterparties c on c.id = d.counterparty_id
       where ($1::text is null
         or lower(d.number) like $1
         or lower(coalesce(c.name, '')) like $1)
         and ($2::text is null or d.type = $2)
         and ($3::text is null or d.status = $3)
       order by d.doc_date desc, d.id desc
       limit 200`,
      [q, type, status],
    );
    return rows.map(mapDocSummary);
  });

export const getDocument = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number() }))
  .middleware([authMiddleware]).handler(async ({ data }): Promise<DocumentDetail> => {
    const sql = await withDb();
    const [docs, lineRows, moveRows] = await Promise.all([
      sql<Record<string, unknown>>`
      select d.*,
        w.name as warehouse_name,
        wf.name as from_warehouse_name,
        wt.name as to_warehouse_name,
        c.name as partner_name,
        src.number as source_number,
        (select s.id from documents s where s.source_id = d.id order by s.id desc limit 1) as shipment_id,
        (select s.number from documents s where s.source_id = d.id order by s.id desc limit 1) as shipment_number,
        (select s.type from documents s where s.source_id = d.id order by s.id desc limit 1) as child_type
      from documents d
      left join warehouses w on w.id = d.warehouse_id
      left join warehouses wf on wf.id = d.from_warehouse_id
      left join warehouses wt on wt.id = d.to_warehouse_id
      left join counterparties c on c.id = d.counterparty_id
      left join documents src on src.id = d.source_id
      where d.id = ${data.id}
    `,
      sql<Record<string, unknown>>`
      select l.id, l.product_id, l.qty, l.price, l.amount,
             p.sku, p.name, p.unit
      from document_lines l
      join products p on p.id = l.product_id
      where l.document_id = ${data.id}
      order by l.id
    `,
      sql<Record<string, unknown>>`
      select m.id, m.product_id, p.name as product_name,
             m.warehouse_id, w.name as warehouse_name, m.qty
      from stock_moves m
      join products p on p.id = m.product_id
      join warehouses w on w.id = m.warehouse_id
      where m.document_id = ${data.id}
      order by m.id
    `,
    ]);
    if (!docs[0]) throw new Error("Документ не найден");
    const d = docs[0];
    const sourceId = d.source_id == null ? null : num(d.source_id);
    const payRows = await sql<Record<string, unknown>>`
      select p.id, p.kind, p.number, p.pay_date, p.partner_id, p.document_id,
             p.amount, p.method, p.comment, c.name as partner_name,
             d.number as document_number, d.type as document_type
      from payments p
      join counterparties c on c.id = p.partner_id
      left join documents d on d.id = p.document_id
      where p.document_id = ${data.id}
         or (${sourceId}::int is not null and p.document_id = ${sourceId})
         or p.document_id in (select s.id from documents s where s.source_id = ${data.id})
      order by p.pay_date, p.id
    `;
    const payments: Payment[] = payRows.map(mapPayment);
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const lines: DocumentLine[] = lineRows.map((r) => ({
      id: num(r.id),
      productId: num(r.product_id),
      sku: String(r.sku),
      name: String(r.name),
      unit: String(r.unit),
      qty: num(r.qty),
      price: num(r.price),
      amount: num(r.amount),
    }));
    const moves: StockMove[] = moveRows.map((r) => ({
      id: num(r.id),
      productId: num(r.product_id),
      productName: String(r.product_name),
      warehouseId: num(r.warehouse_id),
      warehouseName: String(r.warehouse_name),
      qty: num(r.qty),
    }));
    return {
      id: num(d.id),
      type: String(d.type) as DocType,
      number: String(d.number),
      docDate: String(d.doc_date).slice(0, 10),
      status: String(d.status) as DocStatus,
      warehouseId: d.warehouse_id == null ? null : num(d.warehouse_id),
      fromWarehouseId: d.from_warehouse_id == null ? null : num(d.from_warehouse_id),
      toWarehouseId: d.to_warehouse_id == null ? null : num(d.to_warehouse_id),
      counterpartyId: d.counterparty_id == null ? null : num(d.counterparty_id),
      warehouseName: d.warehouse_name == null ? null : String(d.warehouse_name),
      fromWarehouseName: d.from_warehouse_name == null ? null : String(d.from_warehouse_name),
      toWarehouseName: d.to_warehouse_name == null ? null : String(d.to_warehouse_name),
      partnerName: d.partner_name == null ? null : String(d.partner_name),
      comment: String(d.comment ?? ""),
      postedAt: d.posted_at == null ? null : String(d.posted_at),
      sourceId,
      sourceNumber: d.source_number == null ? null : String(d.source_number),
      paidAmount,
      dueAmount: Math.max(0, lines.reduce((s, l) => s + l.amount, 0) - paidAmount),
      payments,
      shipmentId: d.shipment_id == null ? null : num(d.shipment_id),
      shipmentNumber: d.shipment_number == null ? null : String(d.shipment_number),
      childType: d.child_type == null ? null : (String(d.child_type) as DocType),
      inTransit: Boolean(d.in_transit),
      lines,
      moves,
      amount: lines.reduce((s, l) => s + l.amount, 0),
    };
  });

const lineInput = z.object({
  productId: z.number(),
  qty: z.number().positive(),
  price: z.number().nonnegative(),
});

const documentInput = z.object({
  id: z.number().optional(),
  type: z.enum(DOC_TYPES),
  docDate: z.string().min(8),
  warehouseId: z.number().nullable().optional(),
  fromWarehouseId: z.number().nullable().optional(),
  toWarehouseId: z.number().nullable().optional(),
  counterpartyId: z.number().nullable().optional(),
  comment: z.string().optional(),
  lines: z.array(lineInput).min(1),
});

async function nextNumber(type: DocType): Promise<string> {
  const sql = await withDb();
  const prefix = DOC_TYPE_SHORT[type];
  const rows = await sql<{ number: string }>`
    select number from documents where type = ${type} order by id desc limit 1
  `;
  const last = rows[0]?.number ?? "";
  const match = last.match(/(\d+)$/);
  const n = match ? Number(match[1]) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export const saveDocument = createServerFn({ method: "POST" })
  .validator(documentInput)
  .middleware([authMiddleware]).handler(async ({ data }): Promise<{ id: number }> => {
    const sql = await withDb();
    if (data.type === "transfer") {
      if (!data.fromWarehouseId || !data.toWarehouseId) {
        throw new Error("Укажите склады отправления и назначения");
      }
      if (data.fromWarehouseId === data.toWarehouseId) {
        throw new Error("Склады отправления и назначения должны отличаться");
      }
    } else if (!data.warehouseId) {
      throw new Error("Укажите склад");
    }

    let id = data.id;
    if (id) {
      const existing = await sql<{ status: string }>`
        select status from documents where id = ${id}
      `;
      if (!existing[0]) throw new Error("Документ не найден");
      if (existing[0].status === "posted") {
        throw new Error("Проведённый документ нельзя менять — сначала отмените проведение");
      }
      await sql`
        update documents set
          type = ${data.type},
          doc_date = ${data.docDate},
          warehouse_id = ${data.warehouseId ?? null},
          from_warehouse_id = ${data.fromWarehouseId ?? null},
          to_warehouse_id = ${data.toWarehouseId ?? null},
          counterparty_id = ${data.counterpartyId ?? null},
          comment = ${data.comment ?? ""}
        where id = ${id}
      `;
      await sql`delete from document_lines where document_id = ${id}`;
    } else {
      const number = await nextNumber(data.type);
      const rows = await sql<{ id: number }>`
        insert into documents (
          type, number, doc_date, status,
          warehouse_id, from_warehouse_id, to_warehouse_id,
          counterparty_id, comment
        ) values (
          ${data.type}, ${number}, ${data.docDate}, 'draft',
          ${data.warehouseId ?? null}, ${data.fromWarehouseId ?? null},
          ${data.toWarehouseId ?? null}, ${data.counterpartyId ?? null},
          ${data.comment ?? ""}
        )
        returning id
      `;
      id = rows[0].id;
    }

    for (const line of data.lines) {
      const amount = Math.round(line.qty * line.price * 100) / 100;
      await sql`
        insert into document_lines (document_id, product_id, qty, price, amount)
        values (${id}, ${line.productId}, ${line.qty}, ${line.price}, ${amount})
      `;
    }
    return { id: id! };
  });

export const postDocument = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .middleware([authMiddleware]).handler(async ({ data }): Promise<{ ok: true }> => {
    const sql = await withDb();
    const docs = await sql<Record<string, unknown>>`
      select * from documents where id = ${data.id}
    `;
    if (!docs[0]) throw new Error("Документ не найден");
    const d = docs[0];
    if (String(d.status) === "posted") throw new Error("Документ уже проведён");

    const lines = await sql<{ product_id: number; qty: unknown; name: string }>`
      select l.product_id, l.qty, p.name
      from document_lines l
      join products p on p.id = l.product_id
      where l.document_id = ${data.id}
    `;
    if (lines.length === 0) throw new Error("Добавьте хотя бы одну строку");

    const type = String(d.type) as DocType;
    const warehouseId = d.warehouse_id == null ? null : num(d.warehouse_id);
    const fromId = d.from_warehouse_id == null ? null : num(d.from_warehouse_id);
    const toId = d.to_warehouse_id == null ? null : num(d.to_warehouse_id);

    async function stockAt(productId: number, whId: number): Promise<number> {
      const rows = await sql<{ qty: unknown }>`
        select coalesce(sum(qty), 0) as qty
        from stock_moves
        where product_id = ${productId} and warehouse_id = ${whId}
      `;
      return num(rows[0]?.qty);
    }

    if (type === "sale" || type === "writeoff") {
      if (!warehouseId) throw new Error("Не указан склад");
      const missing: string[] = [];
      for (const line of lines) {
        const have = await stockAt(line.product_id, warehouseId);
        if (have < num(line.qty)) {
          missing.push(`${line.name} (нужно ${num(line.qty)}, есть ${have})`);
        }
      }
      if (missing.length) {
        throw new Error(`Недостаточно остатка: ${missing.join("; ")}`);
      }
    }
    if (type === "transfer") {
      if (!fromId || !toId) throw new Error("Не указаны склады перемещения");
      const missing: string[] = [];
      for (const line of lines) {
        const have = await stockAt(line.product_id, fromId);
        if (have < num(line.qty)) {
          missing.push(`${line.name} (нужно ${num(line.qty)}, есть ${have})`);
        }
      }
      if (missing.length) {
        throw new Error(`Недостаточно остатка на складе-источнике: ${missing.join("; ")}`);
      }
    }

    for (const line of lines) {
      const qty = num(line.qty);
      if (type === "purchase") {
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${data.id}, ${line.product_id}, ${warehouseId}, ${qty})
        `;
      } else if (type === "sale" || type === "writeoff") {
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${data.id}, ${line.product_id}, ${warehouseId}, ${-qty})
        `;
      } else if (type === "transfer") {
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${data.id}, ${line.product_id}, ${fromId}, ${-qty})
        `;
        await sql`
          insert into stock_moves (document_id, product_id, warehouse_id, qty)
          values (${data.id}, ${line.product_id}, ${toId}, ${qty})
        `;
      }
    }

    await sql`
      update documents set status = 'posted', posted_at = now() where id = ${data.id}
    `;
    if (type === "purchase" && d.source_id != null) {
      const srcId = num(d.source_id);
      await sql`
        update documents set in_transit = false
        where id = ${srcId} or source_id = ${srcId} or id = ${data.id}
      `;
    }
    return { ok: true };
  });

export const unpostDocument = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .middleware([authMiddleware]).handler(async ({ data }): Promise<{ ok: true }> => {
    const sql = await withDb();
    const docs = await sql<Record<string, unknown>>`
      select * from documents where id = ${data.id}
    `;
    if (!docs[0]) throw new Error("Документ не найден");
    if (String(docs[0].status) !== "posted") throw new Error("Документ не проведён");

    const type = String(docs[0].type) as DocType;
    const lines = await sql<{ product_id: number; qty: unknown; name: string }>`
      select l.product_id, l.qty, p.name
      from document_lines l
      join products p on p.id = l.product_id
      where l.document_id = ${data.id}
    `;

    async function stockAt(productId: number, whId: number): Promise<number> {
      const rows = await sql<{ qty: unknown }>`
        select coalesce(sum(qty), 0) as qty
        from stock_moves
        where product_id = ${productId} and warehouse_id = ${whId}
      `;
      return num(rows[0]?.qty);
    }

    if (type === "purchase") {
      const warehouseId = num(docs[0].warehouse_id);
      const missing: string[] = [];
      for (const line of lines) {
        const have = await stockAt(line.product_id, warehouseId);
        if (have < num(line.qty)) {
          missing.push(
            `${line.name} (на складе ${have}, в документе ${num(line.qty)})`,
          );
        }
      }
      if (missing.length) {
        throw new Error(
          `Нельзя отменить проведение: товар уже израсходован. ${missing.join("; ")}`,
        );
      }
    }

    if (type === "transfer") {
      const toId = num(docs[0].to_warehouse_id);
      const missing: string[] = [];
      for (const line of lines) {
        const have = await stockAt(line.product_id, toId);
        if (have < num(line.qty)) {
          missing.push(`${line.name} (на складе назначения ${have})`);
        }
      }
      if (missing.length) {
        throw new Error(
          `Нельзя отменить перемещение: товар уже ушёл со склада назначения. ${missing.join("; ")}`,
        );
      }
    }

    await sql`delete from stock_moves where document_id = ${data.id}`;
    await sql`
      update documents set status = 'draft', posted_at = null where id = ${data.id}
    `;
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number() }))
  .middleware([authMiddleware]).handler(async ({ data }): Promise<{ ok: true }> => {
    const sql = await withDb();
    const docs = await sql<{ status: string }>`
      select status from documents where id = ${data.id}
    `;
    if (!docs[0]) throw new Error("Документ не найден");
    if (docs[0].status !== "draft") {
      throw new Error("Удалять можно только черновик");
    }
    await sql`delete from documents where id = ${data.id}`;
    return { ok: true };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .validator(z.object({ period: periodSchema }))
  .middleware([authMiddleware]).handler(async ({ data }): Promise<DashboardData> => {
    const sql = await withDb();
    const { from, label } = periodSql(data.period);

    const [revenueRows, stockRows, orders, low, byDay, recent, warehouseValues, top] =
      await Promise.all([
        sql<{ revenue: unknown; cogs: unknown; docs: unknown }>`
          select
            coalesce(sum(l.amount), 0) as revenue,
            coalesce(sum(l.qty * p.purchase_price), 0) as cogs,
            count(distinct d.id) as docs
          from documents d
          join document_lines l on l.document_id = d.id
          join products p on p.id = l.product_id
          where d.type = 'sale' and d.status = 'posted' and d.doc_date >= ${from}
        `,
        sql<{ value: unknown }>`
          select coalesce(sum(x.qty * p.purchase_price), 0) as value
          from (
            select product_id, sum(qty) as qty from stock_moves group by product_id
          ) x
          join products p on p.id = x.product_id
        `,
        sql<{ n: unknown; amount: unknown }>`
          select count(*) as n,
            coalesce(sum((select sum(amount) from document_lines l where l.document_id = d.id)), 0) as amount
          from documents d
          where d.type = 'order' and d.status = 'draft'
        `,
        sql<{
          product_id: number;
          sku: string;
          name: string;
          unit: string;
          min_stock: unknown;
          stock: unknown;
          n_low: unknown;
        }>`
          select p.id as product_id, p.sku, p.name, p.unit, p.min_stock,
                 coalesce(s.stock, 0) as stock,
                 count(*) over() as n_low
          from products p
          left join (
            select product_id, sum(qty) as stock from stock_moves group by product_id
          ) s on s.product_id = p.id
          where coalesce(s.stock, 0) <= p.min_stock
          order by (coalesce(s.stock, 0) / nullif(p.min_stock, 0)) asc nulls first, p.name
          limit 8
        `,
        sql<{ date: string; amount: unknown }>`
          select d.doc_date::text as date, coalesce(sum(l.amount), 0) as amount
          from documents d
          join document_lines l on l.document_id = d.id
          where d.type = 'sale' and d.status = 'posted' and d.doc_date >= ${from}
          group by d.doc_date
          order by d.doc_date
        `,
        sql.query<Record<string, unknown>>(
          `select ${DOC_SELECT}
           from documents d
           left join warehouses w on w.id = d.warehouse_id
           left join warehouses wf on wf.id = d.from_warehouse_id
           left join warehouses wt on wt.id = d.to_warehouse_id
           left join counterparties c on c.id = d.counterparty_id
           order by d.doc_date desc, d.id desc
           limit 8`,
        ),
        sql<{
          id: number;
          name: string;
          city: string;
          value: unknown;
        }>`
          select w.id, w.name, w.city,
            coalesce(sum(m.qty * p.purchase_price), 0) as value
          from warehouses w
          left join stock_moves m on m.warehouse_id = w.id
          left join products p on p.id = m.product_id
          group by w.id, w.name, w.city
          order by w.id
        `,
        sql<{
          product_id: number;
          name: string;
          qty: unknown;
          amount: unknown;
        }>`
          select p.id as product_id, p.name,
                 sum(l.qty) as qty, sum(l.amount) as amount
          from documents d
          join document_lines l on l.document_id = d.id
          join products p on p.id = l.product_id
          where d.type = 'sale' and d.status = 'posted' and d.doc_date >= ${from}
          group by p.id, p.name
          order by sum(l.amount) desc
          limit 5
        `,
      ]);

    const [incomingRows, outgoingRows, receivableRows, payableRows] = await Promise.all([
      sql<{ n: unknown }>`
        select coalesce(sum(amount), 0) as n
        from payments
        where kind = 'in' and pay_date >= ${from}
      `,
      sql<{ n: unknown }>`
        select coalesce(sum(amount), 0) as n
        from payments
        where kind = 'out' and pay_date >= ${from}
      `,
      sql<{ n: unknown }>`
        select coalesce(sum(greatest(doc_amt - paid, 0)), 0) as n
        from (
          select
            coalesce((select sum(l.amount) from document_lines l where l.document_id = d.id), 0) as doc_amt,
            coalesce((
              select sum(p.amount) from payments p
              where p.document_id = d.id
                 or p.document_id = d.source_id
                 or p.document_id in (select s.id from documents s where s.source_id = d.id)
            ), 0) as paid
          from documents d
          where (d.type = 'sale' and d.status = 'posted')
             or (d.type = 'order' and not exists (
               select 1 from documents s where s.source_id = d.id and s.type = 'sale'
             ))
        ) t
      `,
      sql<{ n: unknown }>`
        select coalesce(sum(greatest(doc_amt - paid, 0)), 0) as n
        from (
          select
            coalesce((select sum(l.amount) from document_lines l where l.document_id = d.id), 0) as doc_amt,
            coalesce((select sum(p.amount) from payments p where p.document_id = d.id), 0) as paid
          from documents d
          where d.type = 'purchase' and d.status = 'posted'
        ) t
      `,
    ]);

    const revenue = num(revenueRows[0]?.revenue);
    const cogs = num(revenueRows[0]?.cogs);
    const docsPosted = num(revenueRows[0]?.docs);
    const margin = revenue - cogs;

    return {
      periodLabel: label,
      revenue,
      cogs,
      margin,
      marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
      stockValue: num(stockRows[0]?.value),
      openOrders: num(orders[0]?.n),
      openOrdersAmount: num(orders[0]?.amount),
      lowStockCount: num(low[0]?.n_low),
      docsPosted,
      salesByDay: byDay.map((r) => ({
        date: String(r.date).slice(0, 10),
        amount: num(r.amount),
      })),
      recentDocs: recent.map(mapDocSummary),
      lowStock: low.map((r) => ({
        productId: num(r.product_id),
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        minStock: num(r.min_stock),
        stock: num(r.stock),
      })),
      warehouseValues: warehouseValues.map((r) => ({
        id: num(r.id),
        name: r.name,
        city: r.city,
        value: num(r.value),
      })),
      topProducts: top.map((r) => ({
        productId: num(r.product_id),
        name: r.name,
        qty: num(r.qty),
        amount: num(r.amount),
      })),
      incoming: num(incomingRows[0]?.n),
      outgoing: num(outgoingRows[0]?.n),
      receivable: num(receivableRows[0]?.n),
      payable: num(payableRows[0]?.n),
    };
  });

export const getReports = createServerFn({ method: "GET" })
  .validator(z.object({ period: periodSchema }))
  .middleware([authMiddleware]).handler(async ({ data }): Promise<ReportData> => {
    const sql = await withDb();
    const { from, label } = periodSql(data.period);

    const [byProduct, byPartner, stockValue] = await Promise.all([
      sql<Record<string, unknown>>`
      select p.id as product_id, p.sku, p.name,
        coalesce(sum(l.qty), 0) as qty,
        coalesce(sum(l.amount), 0) as revenue,
        coalesce(sum(l.qty * p.purchase_price), 0) as cogs
      from documents d
      join document_lines l on l.document_id = d.id
      join products p on p.id = l.product_id
      where d.type = 'sale' and d.status = 'posted' and d.doc_date >= ${from}
      group by p.id, p.sku, p.name
      order by sum(l.amount) desc
    `,
      sql<Record<string, unknown>>`
      select c.id as partner_id, c.name, c.city,
        count(distinct d.id) as docs,
        coalesce(sum(l.amount), 0) as revenue
      from documents d
      join counterparties c on c.id = d.counterparty_id
      join document_lines l on l.document_id = d.id
      where d.type = 'sale' and d.status = 'posted' and d.doc_date >= ${from}
      group by c.id, c.name, c.city
      order by sum(l.amount) desc
    `,
      sql<Record<string, unknown>>`
      select p.category,
        coalesce(sum(x.qty * p.purchase_price), 0) as value,
        coalesce(sum(x.qty), 0) as qty
      from (
        select product_id, sum(qty) as qty from stock_moves group by product_id
      ) x
      join products p on p.id = x.product_id
      group by p.category
      order by sum(x.qty * p.purchase_price) desc
    `,
    ]);

    return {
      periodLabel: label,
      byProduct: byProduct.map((r) => {
        const revenue = num(r.revenue);
        const cogs = num(r.cogs);
        return {
          productId: num(r.product_id),
          sku: String(r.sku),
          name: String(r.name),
          qty: num(r.qty),
          revenue,
          cogs,
          margin: revenue - cogs,
        };
      }),
      byPartner: byPartner.map((r) => ({
        partnerId: num(r.partner_id),
        name: String(r.name),
        city: String(r.city),
        docs: num(r.docs),
        revenue: num(r.revenue),
      })),
      stockValue: stockValue.map((r) => ({
        category: String(r.category),
        value: num(r.value),
        qty: num(r.qty),
      })),
    };
  });

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<Employee[]> => {
    const sql = await withDb();
    const rows = await sql<Record<string, unknown>>`
      select id, name, email, "createdAt"
      from "user"
      order by "createdAt" asc
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      email: String(r.email ?? ""),
      createdAt: String(r.createdAt ?? "").slice(0, 10),
    }));
  });

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().trim().min(1),
      email: z.string().trim().email(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ data }): Promise<Employee> => {
    const sql = await withDb();
    const email = data.email.toLowerCase();
    const existing = await sql<{ n: number }>`
      select count(*)::int as n from "user" where email = ${email}
    `;
    if ((existing[0]?.n ?? 0) > 0) {
      throw new Error("Такой email уже есть");
    }
    const id = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(data.password);
    await sql`
      insert into "user" (id, name, email, "emailVerified")
      values (${id}, ${data.name}, ${email}, true)
    `;
    await sql`
      insert into "account" (
        id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
      )
      values (
        ${randomBytes(16).toString("hex")},
        ${id},
        'credential',
        ${id},
        ${passwordHash},
        now(),
        now()
      )
    `;
    return { id, name: data.name, email, createdAt: new Date().toISOString().slice(0, 10) };
  });

async function nextPaymentNumber(kind: PayKind): Promise<string> {
  const sql = await withDb();
  const prefix = kind === "in" ? "ОПЛ" : "ВЫП";
  const rows = await sql<{ number: string }>`
    select number from payments where kind = ${kind} order by id desc limit 1
  `;
  const last = rows[0]?.number ?? "";
  const match = last.match(/(\d+)$/);
  const n = match ? Number(match[1]) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export const listPayments = createServerFn({ method: "GET" })
  .validator(
    z.object({
      kind: z.enum(["in", "out", "all"]).optional(),
      q: z.string().optional(),
    }),
  )
  .middleware([authMiddleware]).handler(async ({ data }): Promise<Payment[]> => {
    const sql = await withDb();
    const kind = data.kind && data.kind !== "all" ? data.kind : null;
    const q = data.q?.trim() ? `%${data.q.trim().toLowerCase()}%` : null;
    const rows = await sql<Record<string, unknown>>`
      select p.id, p.kind, p.number, p.pay_date, p.partner_id, p.document_id,
             p.amount, p.method, p.comment, c.name as partner_name,
             d.number as document_number, d.type as document_type
      from payments p
      join counterparties c on c.id = p.partner_id
      left join documents d on d.id = p.document_id
      where (${kind}::text is null or p.kind = ${kind})
        and (${q}::text is null
          or lower(p.number) like ${q}
          or lower(c.name) like ${q})
      order by p.pay_date desc, p.id desc
      limit 200
    `;
    return rows.map(mapPayment);
  });

export const savePayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      kind: z.enum(["in", "out"]),
      payDate: z.string().min(8),
      partnerId: z.number(),
      documentId: z.number().nullable().optional(),
      amount: z.number().positive(),
      method: z.enum(["cash", "bank", "kaspi"]),
      comment: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<Payment> => {
    const sql = await withDb();
    if (data.documentId) {
      const docs = await sql<{ id: number; counterparty_id: number | null; type: string }>`
        select id, counterparty_id, type from documents where id = ${data.documentId}
      `;
      if (!docs[0]) throw new Error("Документ не найден");
      if (docs[0].counterparty_id && num(docs[0].counterparty_id) !== data.partnerId) {
        throw new Error("Контрагент не совпадает с документом");
      }
    }
    const number = await nextPaymentNumber(data.kind);
    const rows = await sql<Record<string, unknown>>`
      insert into payments (kind, number, pay_date, partner_id, document_id, amount, method, comment)
      values (
        ${data.kind}, ${number}, ${data.payDate}, ${data.partnerId},
        ${data.documentId ?? null}, ${data.amount}, ${data.method}, ${data.comment ?? ""}
      )
      returning id
    `;
    const created = await sql<Record<string, unknown>>`
      select p.id, p.kind, p.number, p.pay_date, p.partner_id, p.document_id,
             p.amount, p.method, p.comment, c.name as partner_name,
             d.number as document_number, d.type as document_type
      from payments p
      join counterparties c on c.id = p.partner_id
      left join documents d on d.id = p.document_id
      where p.id = ${num(rows[0].id)}
    `;
    return mapPayment(created[0]);
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sql = await withDb();
    await sql`delete from payments where id = ${data.id}`;
    return { ok: true };
  });

export const followOn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.number(),
      toType: z.enum(DOC_TYPES).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ id: number }> => {
    const sql = await withDb();
    const docs = await sql<Record<string, unknown>>`
      select * from documents where id = ${data.id}
    `;
    if (!docs[0]) throw new Error("Документ не найден");
    const src = docs[0];
    const fromType = String(src.type) as DocType;
    const toType = (data.toType ?? FOLLOW_TO[fromType]) as DocType | undefined;
    if (!toType) throw new Error("Из этого документа дальше идти некуда");
    const existing = await sql<{ id: number }>`
      select id from documents where source_id = ${data.id} and type = ${toType} limit 1
    `;
    if (existing[0]) return { id: existing[0].id };
    if (toType !== "transfer" && toType !== "writeoff" && !src.counterparty_id) {
      throw new Error("Укажите контрагента");
    }
    if (toType !== "transfer" && !src.warehouse_id) {
      throw new Error("Укажите склад");
    }
    const lines = await sql<{ product_id: number; qty: unknown; price: unknown; amount: unknown }>`
      select product_id, qty, price, amount from document_lines where document_id = ${data.id} order by id
    `;
    if (lines.length === 0) throw new Error("Нет строк");
    const number = await nextNumber(toType);
    const inserted = await sql<{ id: number }>`
      insert into documents (
        type, number, doc_date, status,
        warehouse_id, counterparty_id, comment, source_id
      ) values (
        ${toType}, ${number}, ${String(src.doc_date).slice(0, 10)}, 'draft',
        ${src.warehouse_id == null ? null : num(src.warehouse_id)},
        ${src.counterparty_id == null ? null : num(src.counterparty_id)},
        ${`Из ${String(src.number)}`}, ${data.id}
      )
      returning id
    `;
    const id = inserted[0].id;
    for (const line of lines) {
      await sql`
        insert into document_lines (document_id, product_id, qty, price, amount)
        values (${id}, ${line.product_id}, ${num(line.qty)}, ${num(line.price)}, ${num(line.amount)})
      `;
    }
    return { id };
  });

export const setInTransit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.number(), value: z.boolean() }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sql = await withDb();
    const docs = await sql<{ type: string }>`select type from documents where id = ${data.id}`;
    if (!docs[0]) throw new Error("Документ не найден");
    if (docs[0].type !== "po" && docs[0].type !== "bill") {
      throw new Error("В пути отмечают заказ поставщику или его счёт");
    }
    await sql`update documents set in_transit = ${data.value} where id = ${data.id}`;
    return { ok: true };
  });

export const listInTransit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<TransitRow[]> => {
    const sql = await withDb();
    const rows = await sql<Record<string, unknown>>`
      select d.id as document_id, d.number, coalesce(c.name, '') as partner_name,
             p.name as product_name, l.qty, l.amount
      from documents d
      join document_lines l on l.document_id = d.id
      join products p on p.id = l.product_id
      left join counterparties c on c.id = d.counterparty_id
      where d.in_transit
        and d.type in ('po', 'bill')
        and not exists (
          select 1 from documents r
          where r.type = 'purchase' and r.status = 'posted'
            and (r.source_id = d.id or r.source_id in (
              select b.id from documents b where b.source_id = d.id
            ))
        )
      order by d.doc_date, d.id, l.id
    `;
    return rows.map((r) => ({
      documentId: num(r.document_id),
      number: String(r.number),
      partnerName: String(r.partner_name),
      productName: String(r.product_name),
      qty: num(r.qty),
      amount: num(r.amount),
    }));
  });

export const shipOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.number() }))
  .handler(async ({ data }): Promise<{ id: number }> => {
    const sql = await withDb();
    const orders = await sql<Record<string, unknown>>`
      select * from documents where id = ${data.id}
    `;
    if (!orders[0]) throw new Error("Заказ не найден");
    const order = orders[0];
    if (String(order.type) !== "order" && String(order.type) !== "invoice") {
      throw new Error("Отгрузить можно заказ или счёт покупателю");
    }
    const existing = await sql<{ id: number }>`
      select id from documents where source_id = ${data.id} and type = 'sale' limit 1
    `;
    if (existing[0]) return { id: existing[0].id };
    if (!order.counterparty_id) throw new Error("У заказа нет покупателя");
    if (!order.warehouse_id) throw new Error("У заказа нет склада");
    const lines = await sql<{ product_id: number; qty: unknown; price: unknown; amount: unknown }>`
      select product_id, qty, price, amount from document_lines where document_id = ${data.id} order by id
    `;
    if (lines.length === 0) throw new Error("В заказе нет строк");
    const number = await nextNumber("sale");
    const inserted = await sql<{ id: number }>`
      insert into documents (
        type, number, doc_date, status,
        warehouse_id, counterparty_id, comment, source_id
      ) values (
        'sale', ${number}, ${String(order.doc_date).slice(0, 10)}, 'draft',
        ${num(order.warehouse_id)}, ${num(order.counterparty_id)},
        ${`Из заказа ${String(order.number)}`}, ${data.id}
      )
      returning id
    `;
    const saleId = inserted[0].id;
    for (const line of lines) {
      await sql`
        insert into document_lines (document_id, product_id, qty, price, amount)
        values (${saleId}, ${line.product_id}, ${num(line.qty)}, ${num(line.price)}, ${num(line.amount)})
      `;
    }
    return { id: saleId };
  });
