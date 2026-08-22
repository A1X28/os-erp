import type { Currency, SettleEntry } from "./types";

export function debitCredit(e: SettleEntry): { debit: number; credit: number } {
  if (e.side === "receivable") {
    return e.amount >= 0
      ? { debit: e.amount, credit: 0 }
      : { debit: 0, credit: -e.amount };
  }
  return e.amount >= 0
    ? { debit: 0, credit: e.amount }
    : { debit: -e.amount, credit: 0 };
}

export type SettlePeriodRow = SettleEntry & { debit: number; credit: number };

export type SettlePeriod = {
  currency: Currency;
  openingDebit: number;
  openingCredit: number;
  rows: SettlePeriodRow[];
  turnoverDebit: number;
  turnoverCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export function settlePeriod(
  entries: SettleEntry[],
  from: string,
  to: string,
): SettlePeriod[] {
  if (from > to) {
    const x = from;
    from = to;
    to = x;
  }
  const map = new Map<Currency, SettlePeriod>();
  function bucket(currency: Currency): SettlePeriod {
    const cur = map.get(currency) ?? {
      currency,
      openingDebit: 0,
      openingCredit: 0,
      rows: [],
      turnoverDebit: 0,
      turnoverCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
    };
    map.set(currency, cur);
    return cur;
  }
  for (const e of entries) {
    const { debit, credit } = debitCredit(e);
    const b = bucket(e.currency);
    if (e.date < from) {
      b.openingDebit += debit;
      b.openingCredit += credit;
    } else if (e.date <= to) {
      b.rows.push({ ...e, debit, credit });
      b.turnoverDebit += debit;
      b.turnoverCredit += credit;
    }
  }
  for (const b of map.values()) {
    b.closingDebit = b.openingDebit + b.turnoverDebit;
    b.closingCredit = b.openingCredit + b.turnoverCredit;
  }
  return [...map.values()].filter(
    (b) =>
      b.rows.length > 0 ||
      b.openingDebit > 0.009 ||
      b.openingCredit > 0.009,
  );
}

export function netBalance(debit: number, credit: number): number {
  return Math.round((debit - credit) * 100) / 100;
}

export function yearStartIso(today = ""): string {
  const y = (today || new Date().toISOString()).slice(0, 4);
  return `${y}-01-01`;
}

