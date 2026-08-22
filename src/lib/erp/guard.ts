import type { Sql } from "@/lib/db";
import { runTransaction } from "@/lib/db";
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
  if (/could not serialize|deadlock detected/i.test(text)) {
    return new Error("Документ сейчас проводит кто-то ещё — повторите через секунду");
  }
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
  await withDb();
  try {
    return await runTransaction(fn);
  } catch (e) {
    throw mapDbError(e);
  }
}

export async function lockStock(sql: Sql, productId: number, warehouseId: number) {
  await sql.query("select pg_advisory_xact_lock($1, $2)", [productId, warehouseId]);
}

export async function lockDocument(
  sql: Sql,
  id: number,
): Promise<Record<string, unknown> | undefined> {
  const rows = await sql.query<Record<string, unknown>>(
    "select * from documents where id = $1 for update",
    [id],
  );
  return rows[0];
}

export async function lockNumber(sql: Sql, key: string) {
  await sql.query("select pg_advisory_xact_lock(hashtext($1))", [key]);
}
