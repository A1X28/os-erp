import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { listInTransit, listStock, listWarehouses } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { money, qtyFmt } from "@/lib/erp/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stock")({
  loader: async () => {
    const [warehouses, stock, transit] = await Promise.all([
      orGuest(listWarehouses(), []),
      orGuest(listStock({ data: {} }), []),
      orGuest(listInTransit(), []),
    ]);
    return { warehouses, stock, transit };
  },
  component: StockPage,
});

function StockPage() {
  const initial = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | "all">("all");
  const [lowOnly, setLowOnly] = useState(false);

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => listWarehouses(),
    initialData: initial.warehouses,
    initialDataUpdatedAt: Date.now(),
  });
  const transit = useQuery({
    queryKey: ["in-transit"],
    queryFn: () => listInTransit(),
    initialData: initial.transit,
    initialDataUpdatedAt: Date.now(),
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
    initialData: warehouseId === "all" && !q && !lowOnly ? initial.stock : undefined,
    initialDataUpdatedAt:
      warehouseId === "all" && !q && !lowOnly ? Date.now() : undefined,
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

      <section className="mb-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <h2 className="mb-1 font-display text-lg">В пути</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Заказано у поставщика и ещё не принято. Можно продавать заказом — отгрузить после приёмки.
        </p>
        {(transit.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Сейчас ничего не едет.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(transit.data ?? []).map((row, i) => (
              <li
                key={`${row.documentId}-${i}`}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {row.productName}
                  <span className="block text-xs text-muted-foreground">
                    <Link
                      to="/documents/$id"
                      params={{ id: String(row.documentId) }}
                      className="hover:underline"
                    >
                      {row.number}
                    </Link>
                    {row.partnerName ? ` · ${row.partnerName}` : ""}
                    {row.warehouseName ? ` · ${row.warehouseName}` : ""}
                    {row.inTransit ? " · едет" : " · ожидание"}
                  </span>
                </span>
                <span className="tabular-nums">{qtyFmt(row.qty)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <th className="px-3 py-2 text-right font-medium">На складе</th>
                <th className="px-3 py-2 text-right font-medium">Резерв</th>
                <th className="px-3 py-2 text-right font-medium">Доступно</th>
                <th className="px-3 py-2 text-right font-medium">В пути</th>
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
                    className="px-3 py-2.5 text-right tabular-nums text-muted-foreground"
                  >
                    {qtyFmt(r.qty)} {r.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.reserved > 0 ? qtyFmt(r.reserved) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      r.available <= r.minStock && "text-destructive",
                    )}
                  >
                    {qtyFmt(r.available)} {r.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.incoming > 0 ? `${qtyFmt(r.incoming)} ${r.unit}` : "—"}
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
                    r.available <= r.minStock && "text-destructive",
                  )}
                >
                  {qtyFmt(r.available)} {r.unit}
                  <span className="block text-xs text-muted-foreground">
                    склад {qtyFmt(r.qty)}
                    {r.reserved > 0 ? ` · резерв ${qtyFmt(r.reserved)}` : ""}
                    {r.incoming > 0 ? ` · в пути ${qtyFmt(r.incoming)}` : ""}
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
