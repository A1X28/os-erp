export const DOC_TYPES = [
  "sale",
  "purchase",
  "transfer",
  "order",
  "writeoff",
] as const;

export type DocType = (typeof DOC_TYPES)[number];
export type DocStatus = "draft" | "posted";
export type PartnerKind = "buyer" | "supplier" | "both";
export type PeriodKey = "month" | "30d" | "quarter";

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);
}

export type Warehouse = {
  id: number;
  code: string;
  name: string;
  city: string;
  address: string;
  isDefault: boolean;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  category: string;
  purchasePrice: number;
  salePrice: number;
  vatRate: number;
  minStock: number;
  barcode: string | null;
  isActive: boolean;
  stock: number;
};

export type Partner = {
  id: number;
  name: string;
  inn: string;
  kind: PartnerKind;
  city: string;
  phone: string;
};

export type DocumentLine = {
  id: number;
  productId: number;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  amount: number;
};

export type StockMove = {
  id: number;
  productId: number;
  productName: string;
  warehouseId: number;
  warehouseName: string;
  qty: number;
};

export type DocumentSummary = {
  id: number;
  type: DocType;
  number: string;
  docDate: string;
  status: DocStatus;
  warehouseName: string | null;
  partnerName: string | null;
  amount: number;
  linesCount: number;
};

export type DocumentDetail = {
  id: number;
  type: DocType;
  number: string;
  docDate: string;
  status: DocStatus;
  warehouseId: number | null;
  fromWarehouseId: number | null;
  toWarehouseId: number | null;
  counterpartyId: number | null;
  warehouseName: string | null;
  fromWarehouseName: string | null;
  toWarehouseName: string | null;
  partnerName: string | null;
  comment: string;
  postedAt: string | null;
  lines: DocumentLine[];
  moves: StockMove[];
  amount: number;
};

export type StockRow = {
  productId: number;
  sku: string;
  name: string;
  unit: string;
  category: string;
  minStock: number;
  purchasePrice: number;
  salePrice: number;
  warehouseId: number;
  warehouseName: string;
  qty: number;
  value: number;
  stockTotal: number;
};

export type DashboardData = {
  periodLabel: string;
  revenue: number;
  cogs: number;
  margin: number;
  marginPct: number;
  stockValue: number;
  openOrders: number;
  openOrdersAmount: number;
  lowStockCount: number;
  docsPosted: number;
  salesByDay: { date: string; amount: number }[];
  recentDocs: DocumentSummary[];
  lowStock: {
    productId: number;
    sku: string;
    name: string;
    unit: string;
    minStock: number;
    stock: number;
  }[];
  warehouseValues: { id: number; name: string; city: string; value: number }[];
  topProducts: { productId: number; name: string; qty: number; amount: number }[];
};

export type ReportData = {
  periodLabel: string;
  byProduct: {
    productId: number;
    sku: string;
    name: string;
    qty: number;
    revenue: number;
    cogs: number;
    margin: number;
  }[];
  byPartner: {
    partnerId: number;
    name: string;
    city: string;
    docs: number;
    revenue: number;
  }[];
  stockValue: { category: string; value: number; qty: number }[];
};
