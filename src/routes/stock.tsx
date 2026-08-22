import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { listStock, listWarehouses } from "@/lib/erp/server";
import { money, qtyFmt } from "@/lib/erp/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stock")({ component: StockPage });

function StockPage() {
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | "all">("all");
  const [lowOnly, setLowOnly] = useState(false);

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => listWarehouses(),
  });
  const stock = useQuery({
    queryKey: ["stock", warehouseId, q, lowOnly],
    queryFn: () =>
      listStock({
        data: {
          warehouseId: warehouseId === "all" ? undefined : warehouseId,
          q,
          lowOnly,
        },
      }),
  });

  const rows = stock.data ?? [];
  const total = useMemo(
    () => rows.reduce((s, r) => s + r.value, 0),
    [rows],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Остатки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Себестоимость на складах: {stock.isLoading ? "…" : money(total)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Товар"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={warehouseId === "all"}
            onClick={() => setWarehouseId("all")}
          >
            Все склады
          </Chip>
          {(warehouses.data ?? []).map((w) => (
            <Chip
              key={w.id}
              active={warehouseId === w.id}
              onClick={() => setWarehouseId(w.id)}
            >
              {w.name}
            </Chip>
          ))}
          <Chip active={lowOnly} onClick={() => setLowOnly((v) => !v)}>
            Ниже минимума
          </Chip>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">Склад</th>
                <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                <th className="px-3 py-2 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.productId}-${r.warehouseId}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to="/catalog/$id"
                      params={{ id: String(r.productId) }}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.sku}</div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.warehouseName}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      r.stockTotal <= r.minStock && "text-destructive",
                    )}
                  >
                    {qtyFmt(r.qty)} {r.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border md:hidden">
          {rows.map((r) => (
            <li key={`${r.productId}-${r.warehouseId}`}>
              <Link
                to="/catalog/$id"
                params={{ id: String(r.productId) }}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.warehouseName}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-right text-sm tabular-nums",
                    r.stockTotal <= r.minStock && "text-destructive",
                  )}
                >
                  {qtyFmt(r.qty)} {r.unit}
                  <span className="block text-xs text-muted-foreground">
                    {money(r.value)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!stock.isLoading && rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Остатков нет
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-xs font-medium",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}
