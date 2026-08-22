import type { Currency } from "./types";

export function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  RUB: "₽",
  EUR: "€",
  USD: "$",
  KZT: "₸",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  RUB: "Рубль",
  EUR: "Евро",
  USD: "Доллар",
  KZT: "Тенге",
};

export function money(
  value: number,
  opts?: { digits?: number; currency?: Currency },
): string {
  const digits = opts?.digits ?? 0;
  const symbol = CURRENCY_SYMBOL[opts?.currency ?? "RUB"];
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)} ${symbol}`;
}

export function toBase(amount: number, fxRate: number): number {
  return Math.round(amount * fxRate * 100) / 100;
}

export function qtyFmt(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export function formatDateShort(iso: string): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [, m, day] = d.split("-");
  if (!m || !day) return iso;
  return `${day}.${m}`;
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function vatIncluded(amount: number, rate = 12): number {
  return amount - amount / (1 + rate / 100);
}

const ONES = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

function triad(n: number, female: boolean): string {
  const h = Math.floor(n / 100);
  const t = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (t >= 10 && t < 20) parts.push(TEENS[t - 10]);
  else {
    if (t >= 20) parts.push(TENS[Math.floor(t / 10)]);
    const o = t % 10;
    if (o) parts.push((female ? ONES_F : ONES)[o]);
  }
  return parts.join(" ");
}

function plural(n: number, one: string, few: string, many: string): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 > 10 && m100 < 20) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

export function amountInWords(value: number, currency: Currency = "RUB"): string {
  const n = Math.round(Math.abs(value) * 100);
  const major = Math.floor(n / 100);
  const minor = n % 100;
  const majorNames: Record<Currency, [string, string, string]> = {
    RUB: ["рубль", "рубля", "рублей"],
    EUR: ["евро", "евро", "евро"],
    USD: ["доллар", "доллара", "долларов"],
    KZT: ["тенге", "тенге", "тенге"],
  };
  const minorNames: Record<Currency, [string, string, string]> = {
    RUB: ["копейка", "копейки", "копеек"],
    EUR: ["цент", "цента", "центов"],
    USD: ["цент", "цента", "центов"],
    KZT: ["тиын", "тиына", "тиынов"],
  };
  const femaleMajor = currency === "KZT";
  if (major === 0) {
    return `Ноль ${majorNames[currency][2]} ${String(minor).padStart(2, "0")} ${plural(minor, ...minorNames[currency])}`;
  }
  const millions = Math.floor(major / 1_000_000);
  const thousands = Math.floor((major % 1_000_000) / 1000);
  const rest = major % 1000;
  const parts: string[] = [];
  if (millions) {
    parts.push(
      `${triad(millions, false)} ${plural(millions, "миллион", "миллиона", "миллионов")}`,
    );
  }
  if (thousands) {
    parts.push(
      `${triad(thousands, true)} ${plural(thousands, "тысяча", "тысячи", "тысяч")}`,
    );
  }
  if (rest) parts.push(triad(rest, femaleMajor));
  const head = parts.join(" ").replace(/\s+/g, " ").trim();
  const titled = head.charAt(0).toUpperCase() + head.slice(1);
  return `${titled} ${plural(major, ...majorNames[currency])} ${String(minor).padStart(2, "0")} ${plural(minor, ...minorNames[currency])}`;
}

export function pct(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}
