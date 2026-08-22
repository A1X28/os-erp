import type { DocStatus, DocType, PartnerKind, PeriodKey } from "./types";

export const COMPANY = "Севертрейд";
export const APP_NAME = "Ось";
export const APP_TAGLINE = "Учёт торговли и склада";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  sale: "Отгрузка",
  purchase: "Приёмка",
  transfer: "Перемещение",
  order: "Заказ",
  writeoff: "Списание",
};

export const DOC_TYPE_SHORT: Record<DocType, string> = {
  sale: "ОТГ",
  purchase: "ПРМ",
  transfer: "ПРМЩ",
  order: "ЗАК",
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
