import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { getPartnerSettle } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { formatDate, money } from "@/lib/erp/format";
import { KIND_LABEL } from "@/lib/erp/labels";
import type { Currency } from "@/lib/erp/types";
import { Button } from "@/components/ui/button";
import { PaymentDialog } from "@/components/erp/payment-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partners/$id")({
  loader: ({ params }) =>
    orGuest(getPartnerSettle({ data: { id: Number(params.id) } }), null),
  component: PartnerCardPage,
});

function PartnerCardPage() {
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const partnerId = Number(id);
  const qc = useQueryClient();
  const [pay, setPay] = useState<"in" | "out" | null>(null);

  const q = useQuery({
    queryKey: ["partner-settle", partnerId],
    queryFn: () => getPartnerSettle({ data: { id: partnerId } }),
    initialData: initial ?? undefined,
    initialDataUpdatedAt: initial ? Date.now() : undefined,
  });
  const data = q.data;
  if (!data) {
    return <p className="text-sm text-muted-foreground">Контрагент не найден</p>;
  }
  const p = data.partner;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/partners"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Контрагенты
          </Link>
          <h1 className="mt-1 font-display text-3xl tracking-tight">{p.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {KIND_LABEL[p.kind]}
            {p.city ? ` · ${p.city}` : ""}
            {p.inn ? ` · БИН ${p.inn}` : ""}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPay("out")}>
            Оплатить
          </Button>
          <Button onClick={() => setPay("in")}>Принять оплату</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {data.balances.length === 0 ? (
          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:col-span-2">
            <p className="text-sm text-muted-foreground">Пока нет оборотов</p>
          </div>
        ) : (
          data.balances.map((b) => (
            <BalanceCard key={b.currency} currency={b.currency} receivable={b.receivable} payable={b.payable} />
          ))
        )}
      </div>

      <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 font-display text-lg">Взаиморасчёты</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead className="border-y border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium">Документ</th>
                <th className="px-3 py-2 text-right font-medium">Они</th>
                <th className="px-4 py-2 text-right font-medium">Мы</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={`${e.docId ?? "p"}-${e.payId ?? e.number}-${e.date}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(e.date)}</td>
                  <td className="px-3 py-2.5">
                    {e.docId ? (
                      <Link
                        to="/documents/$id"
                        params={{ id: String(e.docId) }}
                        className="hover:underline"
                      >
                        <span className="font-medium">{e.number}</span>
                        <span className="block text-xs text-muted-foreground">{e.title}</span>
                      </Link>
                    ) : (
                      <span>
                        <span className="font-medium">{e.number}</span>
                        <span className="block text-xs text-muted-foreground">{e.title}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {e.side === "receivable" ? signed(e.amount, e.currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {e.side === "payable" ? signed(e.amount, e.currency) : "—"}
                  </td>
                </tr>
              ))}
              {data.entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    Нет движений
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <PaymentDialog
        open={pay !== null}
        onOpenChange={(v) => {
          if (!v) {
            setPay(null);
            void qc.invalidateQueries({ queryKey: ["partner-settle", partnerId] });
            void qc.invalidateQueries({ queryKey: ["partners"] });
          }
        }}
        defaultKind={pay ?? "in"}
        partnerId={p.id}
      />
    </div>
  );
}

function signed(amount: number, currency: Currency) {
  const text = money(Math.abs(amount), { currency });
  if (amount > 0) return text;
  if (amount < 0) return `−${text}`;
  return money(0, { currency });
}

function BalanceCard({
  currency,
  receivable,
  payable,
}: {
  currency: Currency;
  receivable: number;
  payable: number;
}) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{currency}</p>
      <p className={cn("mt-2 text-sm", receivable >= 0 ? "" : "text-muted-foreground")}>
        {receivable > 0.009
          ? `Они должны ${money(receivable, { currency })}`
          : receivable < -0.009
            ? `Аванс ${money(-receivable, { currency })}`
            : "Они ничего не должны"}
      </p>
      <p className="mt-1 text-sm">
        {payable > 0.009
          ? `Мы должны ${money(payable, { currency })}`
          : payable < -0.009
            ? `Переплата ${money(-payable, { currency })}`
            : "Мы ничего не должны"}
      </p>
    </div>
  );
}
