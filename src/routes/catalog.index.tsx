import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { listProducts } from "@/lib/erp/server";
import { money, qtyFmt } from "@/lib/erp/format";
import { CATEGORIES } from "@/lib/erp/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductDialog } from "@/components/erp/product-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/catalog/")({
  loader: () => listProducts({ data: {} }),
  component: CatalogPage,
});

function CatalogPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const initial = Route.useLoaderData();
  const list = useQuery({
    queryKey: ["products", q, category],
    queryFn: () =>
      listProducts({
        data: { q, category: category === "all" ? undefined : category },
      }),
    initialData: q === "" && category === "all" ? initial : undefined,
  });

  const rows = list.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Номенклатура</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Товары, цены и остаток по всем складам
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Новый товар</Button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название, артикул, штрихкод"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            Все
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">Категория</th>
                <th className="px-3 py-2 text-right font-medium">Закуп</th>
                <th className="px-3 py-2 text-right font-medium">Продажа</th>
                <th className="px-3 py-2 text-right font-medium">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      to="/catalog/$id"
                      params={{ id: String(p.id) }}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.category}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(p.purchasePrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(p.salePrice)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      p.stock <= p.minStock && "text-destructive",
                    )}
                  >
                    {qtyFmt(p.stock)} {p.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border md:hidden">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                to="/catalog/$id"
                params={{ id: String(p.id) }}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.sku} · {p.category}
                  </span>
                </span>
                <span className="text-right text-sm">
                  <span className="block tabular-nums">{money(p.salePrice)}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      p.stock <= p.minStock
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {qtyFmt(p.stock)} {p.unit}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!list.isLoading && rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Ничего не найдено
          </p>
        ) : null}
      </div>

      <ProductDialog
        key={open ? "open" : "closed"}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ["products"] });
          setOpen(false);
        }}
      />
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
