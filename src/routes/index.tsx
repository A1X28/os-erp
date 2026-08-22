import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboard } from "@/lib/erp/server";
import { formatDateShort, money, pct, qtyFmt } from "@/lib/erp/format";
import { COMPANY, PERIOD_LABEL } from "@/lib/erp/labels";
import type { PeriodKey } from "@/lib/erp/types";
import { StatusBadge, TypeBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: () => getDashboard({ data: { period: "month" } }),
  component: Dashboard,
});

const PERIODS: PeriodKey[] = ["month", "30d", "quarter"];

function Dashboard() {
  const initial = Route.useLoaderData();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const q = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => getDashboard({ data: { period } }),
    initialData: period === "month" ? initial : undefined,
  });

  const data = q.data;

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.salesByDay.map((d) => ({
      date: formatDateShort(d.date),
      amount: d.amount,
    }));
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {COMPANY}
          </p>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            {data?.periodLabel ?? "Обзор"}
          </h1>
        </div>
        <div className="flex rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium transition-colors duration-150",
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Выручка"
          value={data ? money(data.revenue) : null}
          hint={data ? `${data.docsPosted} отгрузок` : undefined}
        />
        <Kpi
          label="Маржа"
          value={data ? money(data.margin) : null}
          hint={data ? pct(data.marginPct) : undefined}
        />
        <Kpi
          label="Остатки"
          value={data ? money(data.stockValue) : null}
          hint="себестоимость на складах"
        />
        <Kpi
          label="Заказы"
          value={data ? String(data.openOrders) : null}
          hint={data ? money(data.openOrdersAmount) : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)] lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg">Отгрузки</h2>
            {data ? (
              <span className="text-xs text-muted-foreground">
                {data.lowStockCount} позиций ниже минимума
              </span>
            ) : null}
          </div>
          {q.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : chartData.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Нет продаж за период
            </p>
          ) : (
            <SalesChart data={chartData} />
          )}
        </section>

        <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)] lg:col-span-2">
          <h2 className="mb-3 font-display text-lg">Склады</h2>
          <ul className="space-y-3">
            {(data?.warehouseValues ?? [1, 2, 3]).map((w, i) =>
              typeof w === "number" ? (
                <Skeleton key={i} className="h-12 w-full" />
              ) : (
                <li key={w.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      {w.name}
                      <span className="block text-xs text-muted-foreground">
                        {w.city}
                      </span>
                    </span>
                    <span className="tabular-nums">{money(w.value)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${
                          data && data.stockValue > 0 && w.value > 0
                            ? Math.max(8, (w.value / data.stockValue) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg">Последние документы</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/documents">Все</Link>
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {(data?.recentDocs ?? []).map((d) => (
              <li key={d.id}>
                <Link
                  to="/documents/$id"
                  params={{ id: String(d.id) }}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span>
                    <span className="block text-sm font-medium">{d.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.partnerName ?? d.warehouseName ?? "—"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm tabular-nums">{money(d.amount)}</span>
                    <span className="flex gap-1">
                      <TypeBadge type={d.type} />
                      <StatusBadge status={d.status} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg">Ниже минимума</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/stock">Склад</Link>
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {(data?.lowStock ?? []).map((p) => (
              <li key={p.productId}>
                <Link
                  to="/catalog/$id"
                  params={{ id: String(p.productId) }}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span>
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.sku}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm tabular-nums text-destructive">
                      {qtyFmt(p.stock)} {p.unit}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      мин. {qtyFmt(p.minStock)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {data && data.lowStock.length === 0 ? (
              <li className="py-6 text-sm text-muted-foreground">
                Все позиции выше минимума
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      {data && data.topProducts.length > 0 ? (
        <section className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <h2 className="mb-3 font-display text-lg">Топ продаж</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {data.topProducts.map((p, i) => (
              <li key={p.productId} className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">#{i + 1}</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium">{p.name}</p>
                <p className="mt-2 text-sm tabular-nums">{money(p.amount)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {value ? (
        <p className="mt-2 font-display text-2xl tabular-nums tracking-tight">
          {value}
        </p>
      ) : (
        <Skeleton className="mt-2 h-8 w-32" />
      )}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SalesChart({ data }: { data: { date: string; amount: number }[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={56}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1_000_000
                ? `${Math.round(v / 100_000) / 10}м`
                : v >= 1000
                  ? `${Math.round(v / 1000)}к`
                  : String(v)
            }
          />
          <RTooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [money(Number(v ?? 0)), "Выручка"]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#rev)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
