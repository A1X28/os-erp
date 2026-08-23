export const DOC_TYPES = [
  "po",
  "bill",
  "purchase",
  "order",
  "invoice",
  "sale",
  "transfer",
  "writeoff",
  "sale_return",
  "purchase_return",
  "inventory",
] as const;

export type DocType = (typeof DOC_TYPES)[number];
export type DocStatus = "draft" | "posted";
export type PartnerKind = "buyer" | "supplier" | "both";
export type PeriodKey = "month" | "30d" | "quarter";
export type PayKind = "in" | "out";
export const PAY_METHODS = ["cash", "bank"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const CURRENCIES = ["RUB", "EUR", "USD", "KZT"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

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
  reserved: number;
  available: number;
  incoming: number;
};

export type Partner = {
  id: number;
  name: string;
  inn: string;
  kind: PartnerKind;
  city: string;
  address: string;
  phone: string;
  bank: string;
  iik: string;
  bik: string;
  receivableBase: number;
  payableBase: number;
};

export type SettleBalance = {
  currency: Currency;
  receivable: number;
  payable: number;
};

export type SettleEntry = {
  date: string;
  number: string;
  title: string;
  docId: number | null;
  payId: number | null;
  currency: Currency;
  amount: number;
  side: "receivable" | "payable";
};

export type PartnerSettle = {
  partner: Partner;
  balances: SettleBalance[];
  entries: SettleEntry[];
};

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff";
  createdAt: string;
};

export type Me = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff";
};

export type Payment = {
  id: number;
  kind: PayKind;
  number: string;
  payDate: string;
  partnerId: number;
  partnerName: string;
  documentId: number | null;
  documentNumber: string | null;
  documentType: DocType | null;
  amount: number;
  method: PayMethod;
  accountId: number;
  accountName: string;
  comment: string;
  currency: Currency;
  fxRate: number;
};

export type MoneyAccount = {
  id: number;
  kind: PayMethod;
  name: string;
  currency: Currency;
  isDefault: boolean;
  balance: number;
};

export type MoneyTransfer = {
  id: number;
  number: string;
  payDate: string;
  fromId: number;
  toId: number;
  fromName: string;
  toName: string;
  amount: number;
  currency: Currency;
  comment: string;
};

export type DocumentLine = {
  id: number;
  productId: number;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  expectedQty: number | null;
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
  currency: Currency;
  fxRate: number;
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
  partnerInn: string | null;
  partnerCity: string | null;
  partnerAddress: string | null;
  partnerPhone: string | null;
  partnerBank: string | null;
  partnerIik: string | null;
  partnerBik: string | null;
  comment: string;
  postedAt: string | null;
  sourceId: number | null;
  sourceNumber: string | null;
  currency: Currency;
  fxRate: number;
  paidAmount: number;
  dueAmount: number;
  payments: Payment[];
  shipmentId: number | null;
  shipmentNumber: string | null;
  childType: DocType | null;
  inTransit: boolean;
  followOpen: boolean;
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
  reserved: number;
  available: number;
  incoming: number;
  value: number;
  stockTotal: number;
};

export type TransitRow = {
  documentId: number;
  number: string;
  partnerName: string;
  warehouseName: string;
  productName: string;
  qty: number;
  amount: number;
  inTransit: boolean;
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
  incoming: number;
  outgoing: number;
  receivable: number;
  payable: number;
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

export type PeriodMonth = {
  year: number;
  month: number;
  label: string;
  closed: boolean;
  auto: boolean;
  closedAt: string | null;
  closedEmail: string | null;
  canClose: boolean;
  canReopen: boolean;
  closesOn: string | null;
};

export type PeriodBoard = {
  autoClose: boolean;
  graceDays: number;
  months: PeriodMonth[];
};

export type CompanyProfile = {
  name: string;
  bin: string;
  address: string;
  phone: string;
  bank: string;
  iik: string;
  bik: string;
  vatEnabled: boolean;
  vatRate: number;
  taxRate: number;
  taxExtraRate: number;
  taxThreshold: number;
  baseCurrency: Currency;
};

export const DEFAULT_COMPANY: CompanyProfile = {
  name: "Севертрейд",
  bin: "",
  address: "",
  phone: "",
  bank: "",
  iik: "",
  bik: "",
  vatEnabled: true,
  vatRate: 12,
  taxRate: 6,
  taxExtraRate: 1,
  taxThreshold: 300000,
  baseCurrency: "RUB",
};

export type TaxEstimate = {
  year: number;
  cash: number;
  shipped: number;
  rate: number;
  extraRate: number;
  threshold: number;
  main: number;
  extra: number;
  total: number;
  overThreshold: number;
};
