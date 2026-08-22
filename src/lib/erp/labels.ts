import type { DocStatus, DocType, PartnerKind, PayKind, PayMethod, PeriodKey } from "./types";

export const COMPANY = "Севертрейд";
export const APP_NAME = "Ось";
export const APP_TAGLINE = "Учёт торговли и склада";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  po: "Заказ поставщику",
  bill: "Счёт поставщика",
  purchase: "Приёмка",
  order: "Заказ покупателя",
  invoice: "Счёт покупателю",
  sale: "Отгрузка",
  transfer: "Перемещение",
  writeoff: "Списание",
};

export const DOC_TYPE_SHORT: Record<DocType, string> = {
  po: "ЗП",
  bill: "СЧС",
  purchase: "ПРМ",
  order: "ЗПк",
  invoice: "СЧП",
  sale: "ОТГ",
  transfer: "ПРМЩ",
  writeoff: "СПС",
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Черновик",
  posted: "Проведён",
};

export const KIND_LABEL: Record<PartnerKind, string> = {
  buyer: "Покупатель",
  supplier: "Поставщик",
  both: "Покупатель и поставщик",
};

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  month: "Этот месяц",
  "30d": "30 дней",
  quarter: "Квартал",
};

export const CATEGORIES = [
  "Стройматериалы",
  "Отделка",
  "Крепёж",
  "Инженерка",
  "Инструмент",
] as const;

export const UNITS = ["шт", "меш", "м²", "уп", "рул", "бух", "м"] as const;

export const PAY_KIND_LABEL: Record<PayKind, string> = {
  in: "Оплата от клиента",
  out: "Оплата поставщику",
};

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Наличные",
  bank: "Банк",
  kaspi: "Kaspi",
};

export const BUY_STEPS = [
  { n: 1, label: "Товар", to: "/catalog" },
  { n: 2, label: "Заказ пост.", to: "/documents/new", search: { type: "po" as const } },
  { n: 3, label: "Счёт", to: "/documents/new", search: { type: "bill" as const } },
  { n: 4, label: "Оплата", to: "/money", search: { new: "out" as const } },
  { n: 5, label: "В пути", to: "/stock" },
  { n: 6, label: "Приёмка", to: "/documents/new", search: { type: "purchase" as const } },
] as const;

export const SELL_STEPS = [
  { n: 1, label: "Заказ", to: "/documents/new", search: { type: "order" as const } },
  { n: 2, label: "Счёт", to: "/documents/new", search: { type: "invoice" as const } },
  { n: 3, label: "Оплата", to: "/money", search: { new: "in" as const } },
  { n: 4, label: "Отгрузка", to: "/documents/new", search: { type: "sale" as const } },
] as const;

export const FOLLOW_LABEL: Partial<Record<DocType, string>> = {
  po: "Получить счёт",
  bill: "Принять товар",
  order: "Выставить счёт",
  invoice: "Отгрузить",
};

export const FOLLOW_TO: Partial<Record<DocType, DocType>> = {
  po: "bill",
  bill: "purchase",
  order: "invoice",
  invoice: "sale",
};

export const SUPPLIER_DOC: DocType[] = ["po", "bill", "purchase"];
export const BUYER_DOC: DocType[] = ["order", "invoice", "sale"];
