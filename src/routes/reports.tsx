import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getReports, getTaxEstimate } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { money, pct, qtyFmt } from "@/lib/erp/format";
import { PERIOD_LABEL } from "@/lib/erp/labels";
import type { PeriodKey } from "@/lib/erp/types";
import { cn } from "@/lib/utils";

function currentYear() {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
      year: "numeric",
    }).format(new Date()),
  );
}

export const Route = createFileRoute("/reports")({
  loader: () => orGuest(getReports({ data: { period: "month" } }), null),
  component: ReportsPage,
});

const PERIODS: PeriodKey[] = ["month", "30d", "quarter"];

function ReportsPage() {
  const initial = Route.useLoaderData();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [year, setYear] = useState(currentYear);
  const q = useQuery({
    queryKey: ["reports", period],
    queryFn: () => getReports({ data: { period } }),
    initialData: period === "month" && initial ? initial : undefined,
    initialDataUpdatedAt: period === "month" && initial ? Date.now() : undefined,
  });
  const tax = useQuery({
    queryKey: ["tax", year],
    queryFn: () => getTaxEstimate({ data: { year } }),
  });
  const data = q.data;
  const t = tax.data;

  const revTotal = data?.byProduct.reduce((s, r) => s + r.revenue, 0) ?? 0;
  const marginTotal = data?.byProduct.reduce((s, r) => s + r.margin, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Отчёты</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.periodLabel ?? "Продажи и склад"}
          </p>
        </div>
        <div className="flex rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium",
                period === p
                  ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                  : "text-muted-foreground",
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Выручка
          </p>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {money(revTotal)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Маржа
          </p>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {money(marginTotal)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Рентабельность
          </p>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {pct(revTotal > 0 ? (marginTotal / revTotal) * 100 : 0)}
          </p>
        </div>
      </div>

      <section className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Налог с оборота</h2>
            <p className="text-xs text-muted-foreground">
              С оплат от клиентов за год. Ставки — в{" "}
              <Link to="/company" className="underline-offset-2 hover:underline">
                профиле
              </Link>
              .
            </p>
          </div>
          <div className="flex rounded-lg bg-muted p-1">
            {[currentYear() - 1, currentYear()].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium",
                  year === y
                    ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                    : "text-muted-foreground",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        {t ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Оплаты
              </p>
              <p className="mt-1 font-display text-xl tabular-nums">{money(t.cash)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.rate}% с оборота
              </p>
              <p className="mt-1 font-display text-xl tabular-nums">{money(t.main)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.extraRate}% сверх {money(t.threshold)}
              </p>
              <p className="mt-1 font-display text-xl tabular-nums">{money(t.extra)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Отложить
              </p>
              <p className="mt-1 font-display text-xl tabular-nums">{money(t.total)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Считаем…</p>
        )}
        {t && Math.abs(t.cash - t.shipped) > 1 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Отгрузки за год {money(t.shipped)} — налог берём с денег, не с
            накладных.
          </p>
        ) : null}
      </section>

      <section className="mt-4 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 font-display text-lg">Продажи по товарам</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[640px] text-sm">
            <thead className="border-y border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                <th className="px-3 py-2 text-right font-medium">Выручка</th>
                <th className="px-3 py-2 text-right font-medium">Себест.</th>
                <th className="px-3 py-2 text-right font-medium">Маржа</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byProduct ?? []).map((r) => (
                <tr key={r.productId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.sku}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {qtyFmt(r.qty)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(r.revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(r.cogs)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(r.margin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <h2 className="mb-3 font-display text-lg">По покупателям</h2>
          <ul className="divide-y divide-border">
            {(data?.byPartner ?? []).map((r) => (
              <li
                key={r.partnerId}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span>
                  {r.name}
                  <span className="block text-xs text-muted-foreground">
                    {r.city} · {r.docs} док.
                  </span>
                </span>
                <span className="tabular-nums">{money(r.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <h2 className="mb-3 font-display text-lg">Склад по категориям</h2>
          <ul className="divide-y divide-border">
            {(data?.stockValue ?? []).map((r) => (
              <li
                key={r.category}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span>{r.category}</span>
                <span className="tabular-nums">{money(r.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
