import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { listDocuments } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { formatDate, money } from "@/lib/erp/format";
import { DOC_TYPE_LABEL } from "@/lib/erp/labels";
import type { DocType } from "@/lib/erp/types";
import { StatusBadge, TypeBadge } from "@/components/erp/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/documents/")({
  loader: () => orGuest(listDocuments({ data: {} }), []),
  component: DocumentsPage,
});

const TYPES: Array<"all" | DocType> = [
  "all",
  "po",
  "bill",
  "purchase",
  "purchase_return",
  "order",
  "invoice",
  "sale",
  "sale_return",
  "transfer",
  "writeoff",
];

function DocumentsPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | DocType>("all");
  const [status, setStatus] = useState<"all" | "draft" | "posted">("all");

  const initial = Route.useLoaderData();
  const list = useQuery({
    queryKey: ["documents", q, type, status],
    queryFn: () => listDocuments({ data: { q, type, status } }),
    initialData: q === "" && type === "all" && status === "all" ? initial : undefined,
    initialDataUpdatedAt:
      q === "" && type === "all" && status === "all" && initial ? Date.now() : undefined,
  });

  const rows = list.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Документы</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Отгрузки, приёмки, заказы и перемещения
          </p>
        </div>
        <Button asChild>
          <Link to="/documents/new" search={{ type: "sale" }}>
            Новая отгрузка
          </Link>
        </Button>
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
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "h-8 rounded-full px-3 text-xs font-medium",
                type === t ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {t === "all" ? "Все" : DOC_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["all", "Все статусы"],
              ["draft", "Черновики"],
              ["posted", "Проведённые"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={cn(
                "h-8 rounded-full px-3 text-xs font-medium",
                status === k ? "bg-card shadow-[var(--shadow-border)]" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <ul className="divide-y divide-border">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                to="/documents/$id"
                params={{ id: String(d.id) }}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.number}</span>
                    <TypeBadge type={d.type} />
                    <StatusBadge status={d.status} />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatDate(d.docDate)}
                    {d.partnerName ? ` · ${d.partnerName}` : ""}
                    {d.warehouseName ? ` · ${d.warehouseName}` : ""}
                  </span>
                </span>
                <span className="text-sm tabular-nums sm:text-right">
                  {money(d.amount, { currency: d.currency })}
                  <span className="block text-xs text-muted-foreground">
                    {d.linesCount} стр.
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {list.isLoading ? (
            <li className="px-4 py-8 text-sm text-muted-foreground">Загрузка…</li>
          ) : null}
          {!list.isLoading && rows.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Документов нет
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
