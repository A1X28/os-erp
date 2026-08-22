import type { Sql } from "@/lib/db";
import { withDb } from "./db";

export function mapDbError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(String(e));
  const text = e.message
    .replace(/^error:\s*/i, "")
    .replace(/^ERROR:\s*/i, "")
    .split("\n")[0]
    .replace(/\s+Where:.*$/i, "")
    .trim();
  if (/[А-Яа-яЁё]/.test(text)) return new Error(text);
  if (text.includes("duplicate key")) return new Error("Такой номер уже есть");
  if (text.includes("violates foreign key")) {
    return new Error("Ссылка на несуществующую запись");
  }
  if (text.includes("violates check constraint")) {
    if (text.includes("qty")) return new Error("Количество должно быть больше нуля");
    if (text.includes("amount")) return new Error("Сумма строки не сходится с количеством и ценой");
    if (text.includes("type")) return new Error("Неизвестный тип документа");
    if (text.includes("status")) return new Error("Некорректный статус документа");
    return new Error("Данные не прошли проверку ядра");
  }
  return e;
}

export async function withTx<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = await withDb();
  await sql.query("begin");
  try {
    const out = await fn(sql);
    await sql.query("commit");
    return out;
  } catch (e) {
    try {
      await sql.query("rollback");
    } catch {
      // connection already aborted
    }
    throw mapDbError(e);
  }
}

export async function lockStock(sql: Sql, productId: number, warehouseId: number) {
  await sql.query("select pg_advisory_xact_lock($1, $2)", [productId, warehouseId]);
}
