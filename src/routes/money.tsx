import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { deletePayment, listPayments } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { formatDate, money } from "@/lib/erp/format";
import { PAY_KIND_LABEL, PAY_METHOD_LABEL } from "@/lib/erp/labels";
import type { PayKind } from "@/lib/erp/types";
import { PaymentDialog } from "@/components/erp/payment-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/money")({
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === "in" || search.new === "out" ? search.new : undefined,
  }),
  loader: () => orGuest(listPayments({ data: { kind: "all" } }), []),
  component: MoneyPage,
});

function MoneyPage() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | PayKind>("all");
  const [payOpen, setPayOpen] = useState<PayKind | null>(
    search.new === "in" || search.new === "out" ? search.new : null,
  );
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["payments", q, kind],
    queryFn: () => listPayments({ data: { q, kind } }),
    initialData: q === "" && kind === "all" ? initial : undefined,
    initialDataUpdatedAt: q === "" && kind === "all" ? Date.now() : undefined,
  });
  const rows = list.data ?? [];
  const incoming = rows.filter((r) => r.kind === "in").reduce((s, r) => s + r.amount, 0);
  const outgoing = rows.filter((r) => r.kind === "out").reduce((s, r) => s + r.amount, 0);

  const del = useMutation({
    mutationFn: (id: number) => deletePayment({ data: { id } }),
    onSuccess: () => {
      toast.success("Оплата удалена");
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Деньги</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Оплаты от клиентов и платежи поставщикам
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPayOpen("out")}>
            Поставщику
          </Button>
          <Button onClick={() => setPayOpen("in")}>От клиента</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Пришло</p>
          <p className="font-display text-2xl tabular-nums tracking-tight text-success">
            {money(incoming)}
          </p>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted-foreground">Ушло</p>
          <p className="font-display text-2xl tabular-nums tracking-tight">{money(outgoing)}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Номер или контрагент"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Все"],
              ["in", "От клиентов"],
              ["out", "Поставщикам"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "h-8 rounded-full px-3 text-xs font-medium",
                kind === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Номер</th>
              <th className="px-4 py-3 font-medium">Контрагент</th>
              <th className="px-4 py-3 font-medium">Документ</th>
              <th className="px-4 py-3 text-right font-medium">Сумма</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(row.payDate)} · {PAY_METHOD_LABEL[row.method]}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {row.partnerName}
                  <span className="block text-xs text-muted-foreground">
                    {PAY_KIND_LABEL[row.kind]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.documentId && row.documentNumber ? (
                    <Link
                      to="/documents/$id"
                      params={{ id: String(row.documentId) }}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {row.documentNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    row.kind === "in" ? "text-success" : "",
                  )}
                >
                  {row.kind === "in" ? "+" : "−"}
                  {money(row.amount)}
                </td>
                <td className="px-2 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => del.mutate(row.id)}
                  >
                    Удалить
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Пока пусто. Примите оплату от клиента или заплатите поставщику.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PaymentDialog
        open={payOpen !== null}
        onOpenChange={(v) => {
          if (!v) setPayOpen(null);
        }}
        defaultKind={payOpen ?? "in"}
      />
    </div>
  );
}
