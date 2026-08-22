import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { getProduct } from "@/lib/erp/server";
import { formatDate, money, qtyFmt } from "@/lib/erp/format";
import { DOC_TYPE_LABEL } from "@/lib/erp/labels";
import { Button } from "@/components/ui/button";
import { ProductDialog } from "@/components/erp/product-dialog";

export const Route = createFileRoute("/catalog/$id")({
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const productId = Number(id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["product", productId],
    queryFn: () => getProduct({ data: { id: productId } }),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (!q.data) {
    return <p className="text-sm text-destructive">Товар не найден</p>;
  }

  const { product, byWarehouse, moves } = q.data;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs text-muted-foreground">
        <Link to="/catalog" className="hover:underline">
          Номенклатура
        </Link>
        <span> / {product.sku}</span>
      </p>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.category} · {product.unit}
            {product.barcode ? ` · ${product.barcode}` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Изменить
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Закуп" value={money(product.purchasePrice)} />
        <Stat label="Продажа" value={money(product.salePrice)} />
        <Stat
          label="Доступно сейчас"
          value={`${qtyFmt(product.available)} ${product.unit}`}
          warn={product.available <= product.minStock}
        />
        <Stat
          label="Ожидается"
          value={`${qtyFmt(product.incoming)} ${product.unit}`}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Продать заказом можно {qtyFmt(product.available + product.incoming)} {product.unit}.
        Отгрузить со склада — только когда товар уже приняли.
      </p>

      <section className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <h2 className="mb-3 font-display text-lg">По складам</h2>
        <ul className="divide-y divide-border">
          {byWarehouse.map((w) => (
            <li
              key={w.warehouseId}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span>
                {w.name}
                <span className="block text-xs text-muted-foreground">{w.city}</span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block">
                  {qtyFmt(w.available ?? w.qty)} {product.unit}
                </span>
                <span className="block text-xs text-muted-foreground">
                  склад {qtyFmt(w.qty)}
                  {w.incoming ? ` · ожидается ${qtyFmt(w.incoming)}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <h2 className="mb-3 font-display text-lg">Движения</h2>
        <ul className="divide-y divide-border">
          {moves.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{m.number}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(m.docDate)} · {DOC_TYPE_LABEL[m.type]} · {m.warehouseName}
                </span>
              </span>
              <span
                className={
                  m.qty < 0
                    ? "tabular-nums text-destructive"
                    : "tabular-nums text-success"
                }
              >
                {m.qty > 0 ? "+" : ""}
                {qtyFmt(m.qty)}
              </span>
            </li>
          ))}
          {moves.length === 0 ? (
            <li className="py-6 text-sm text-muted-foreground">Движений ещё нет</li>
          ) : null}
        </ul>
      </section>

      <ProductDialog
        key={product.id}
        open={open}
        onOpenChange={setOpen}
        initial={product}
        onSaved={() => {
          setOpen(false);
          void qc.invalidateQueries({ queryKey: ["product", productId] });
          void qc.invalidateQueries({ queryKey: ["products"] });
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          warn
            ? "mt-2 font-display text-2xl tabular-nums text-destructive"
            : "mt-2 font-display text-2xl tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}
