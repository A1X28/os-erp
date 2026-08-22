import { getSql, type Sql } from "@/lib/db";
import { seedIfEmpty } from "./seed";

let ready = false;
let seeding: Promise<void> | null = null;

export async function withDb(): Promise<Sql> {
  const sql = await getSql();
  if (ready) return sql;
  seeding ??= (async () => {
    const rows = await sql<{ n: number }>`select count(*)::int as n from warehouses`;
    if ((rows[0]?.n ?? 0) === 0) {
      await seedIfEmpty(sql);
    }
    ready = true;
  })();
  await seeding;
  return sql;
}
