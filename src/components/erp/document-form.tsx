import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/erp/status-badge";
import { PaymentDialog } from "@/components/erp/payment-dialog";
import {
  deleteDraft,
  followOn,
  getDocument,
  listPartners,
  listProducts,
  listWarehouses,
  postDocument,
  saveDocument,
  setInTransit,
  unpostDocument,
} from "@/lib/erp/server";
import { DOC_TYPE_LABEL, FOLLOW_LABEL, FOLLOW_TO, BUYER_DOC, SUPPLIER_DOC } from "@/lib/erp/labels";
import { formatDate, money, num, qtyFmt, todayIso, vatIncluded } from "@/lib/erp/format";
import type { DocType, DocumentDetail, Product } from "@/lib/erp/types";
import { cn } from "@/lib/utils";

type DraftLine = {
  key: string;
  productId: number;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
};

function defaultPrice(type: DocType, product: Product) {
  if (type === "sale" || type === "order" || type === "invoice") return product.salePrice;
  return product.purchasePrice;
}

function ProductPicker({
  products,
  onPick,
}: {
  products: Product[];
  onPick: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = products.filter((p) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.sku.toLowerCase().includes(s) ||
      (p.barcode ?? "").includes(s)
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start sm:w-auto">
          <Plus className="size-4" />
          Добавить строку
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 sm:w-96">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название, артикул, штрихкод"
            className="pl-8"
          />
        </div>
        <ul className="max-h-64 overflow-auto">
          {filtered.slice(0, 30).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                  setQ("");
                }}
              >
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.sku} · {p.unit} · остаток {qtyFmt(p.stock)}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {money(p.salePrice)}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-muted-foreground">
              Ничего не найдено
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function DocumentForm({
  initial,
  defaultType,
}: {
  initial?: DocumentDetail;
  defaultType: DocType;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const locked = initial?.status === "posted";

  const [type, setType] = useState<DocType>(initial?.type ?? defaultType);
  const [docDate, setDocDate] = useState(initial?.docDate ?? todayIso());
  const [warehouseId, setWarehouseId] = useState<string>(
    initial?.warehouseId ? String(initial.warehouseId) : "",
  );
  const [fromWarehouseId, setFromWarehouseId] = useState<string>(
    initial?.fromWarehouseId ? String(initial.fromWarehouseId) : "",
  );
  const [toWarehouseId, setToWarehouseId] = useState<string>(
    initial?.toWarehouseId ? String(initial.toWarehouseId) : "",
  );
  const [counterpartyId, setCounterpartyId] = useState<string>(
    initial?.counterpartyId ? String(initial.counterpartyId) : "",
  );
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    () =>
      initial?.lines.map((l) => ({
        key: String(l.id),
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        price: l.price,
      })) ?? [],
  );

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => listWarehouses(),
  });
  const products = useQuery({
    queryKey: ["products", "", ""],
    queryFn: () => listProducts({ data: {} }),
  });
  const partners = useQuery({
    queryKey: ["partners", "", SUPPLIER_DOC.includes(type) ? "supplier" : "buyer"],
    queryFn: () =>
      listPartners({
        data: {
          kind: SUPPLIER_DOC.includes(type)
            ? "supplier"
            : BUYER_DOC.includes(type)
              ? "buyer"
              : "all",
        },
      }),
  });

  const whList = warehouses.data ?? [];
  useEffect(() => {
    if (!warehouseId && whList.length && type !== "transfer") {
      const def = whList.find((w) => w.isDefault) ?? whList[0];
      setWarehouseId(String(def.id));
    }
  }, [warehouseId, whList, type]);

  const amount = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.price, 0),
    [lines],
  );
  const vat = vatIncluded(amount, 12);

  function invalidateAll() {
    void qc.invalidateQueries();
  }

  const saveMut = useMutation({
    mutationFn: (thenPost: boolean) =>
      saveDocument({
        data: {
          id: initial?.id,
          type,
          docDate,
          warehouseId: type === "transfer" ? null : Number(warehouseId) || null,
          fromWarehouseId:
            type === "transfer" ? Number(fromWarehouseId) || null : null,
          toWarehouseId:
            type === "transfer" ? Number(toWarehouseId) || null : null,
          counterpartyId: counterpartyId ? Number(counterpartyId) : null,
          comment,
          lines: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            price: l.price,
          })),
        },
      }).then(async (res) => {
        if (thenPost) await postDocument({ data: { id: res.id } });
        return { id: res.id, posted: thenPost };
      }),
    onSuccess: (res) => {
      invalidateAll();
      toast.success(res.posted ? "Документ проведён" : "Черновик сохранён");
      if (!initial) {
        void navigate({ to: "/documents/$id", params: { id: String(res.id) } });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const postMut = useMutation({
    mutationFn: () => postDocument({ data: { id: initial!.id } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Документ проведён, остатки обновлены");
      void qc.invalidateQueries({ queryKey: ["document", initial!.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unpostMut = useMutation({
    mutationFn: () => unpostDocument({ data: { id: initial!.id } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Проведение отменено");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteDraft({ data: { id: initial!.id } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Черновик удалён");
      void navigate({ to: "/documents" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const followMut = useMutation({
    mutationFn: (toType?: DocType) =>
      followOn({ data: { id: initial!.id, toType } }),
    onSuccess: (res) => {
      invalidateAll();
      toast.success("Следующий документ создан");
      void navigate({ to: "/documents/$id", params: { id: String(res.id) } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const transitMut = useMutation({
    mutationFn: () => setInTransit({ data: { id: initial!.id, value: true } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Товар отмечен как в пути");
      void qc.invalidateQueries({ queryKey: ["document", initial!.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [payOpen, setPayOpen] = useState(false);
  const needsPartner =
    type === "sale" ||
    type === "purchase" ||
    type === "order" ||
    type === "po" ||
    type === "bill" ||
    type === "invoice";
  const moneyTypes = ["sale", "order", "purchase", "po", "bill", "invoice"];
  const canPay = Boolean(initial) && moneyTypes.includes(type) && (initial?.dueAmount ?? 0) > 0;
  const canFollow = Boolean(initial) && Boolean(FOLLOW_TO[type]) && !initial?.shipmentId;
  const canShip =
    Boolean(initial) &&
    (type === "order" || type === "invoice") &&
    !(initial?.childType === "sale");
  const canTransit =
    Boolean(initial) &&
    (type === "po" || type === "bill") &&
    !initial?.inTransit;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Документ
          </p>
          <h1 className="font-display text-3xl tracking-tight">
            {initial ? initial.number : `Новая ${DOC_TYPE_LABEL[type].toLowerCase()}`}
          </h1>
          {initial ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(initial.docDate)}
              {initial.partnerName ? ` · ${initial.partnerName}` : ""}
            </p>
          ) : null}
        </div>
        {initial ? (
          <div className="flex items-center gap-2">
            {initial.inTransit ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                В пути
              </span>
            ) : null}
            <StatusBadge status={initial.status} />
          </div>
        ) : null}
      </div>

      {initial?.sourceNumber ? (
        <p className="-mt-3 mb-4 text-sm text-muted-foreground">
          Из заказа {initial.sourceNumber}
        </p>
      ) : null}
      {initial?.shipmentId && initial.shipmentNumber ? (
        <p className="-mt-3 mb-4 text-sm">
          {initial.childType ? DOC_TYPE_LABEL[initial.childType] : "Далее"}{" "}
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() =>
              void navigate({
                to: "/documents/$id",
                params: { id: String(initial.shipmentId) },
              })
            }
          >
            {initial.shipmentNumber}
          </button>
        </p>
      ) : null}

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>Тип</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as DocType)}
              disabled={locked || Boolean(initial)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOC_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Дата</Label>
            <Input
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              disabled={locked}
            />
          </div>
          {type === "transfer" ? (
            <>
              <div className="grid gap-1.5">
                <Label>Со склада</Label>
                <Select
                  value={fromWarehouseId}
                  onValueChange={setFromWarehouseId}
                  disabled={locked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Склад" />
                  </SelectTrigger>
                  <SelectContent>
                    {whList.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>На склад</Label>
                <Select
                  value={toWarehouseId}
                  onValueChange={setToWarehouseId}
                  disabled={locked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Склад" />
                  </SelectTrigger>
                  <SelectContent>
                    {whList.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="grid gap-1.5">
              <Label>Склад</Label>
              <Select
                value={warehouseId}
                onValueChange={setWarehouseId}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Склад" />
                </SelectTrigger>
                <SelectContent>
                  {whList.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name} · {w.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {needsPartner ? (
            <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
              <Label>
                {type === "purchase" || type === "po" || type === "bill"
                  ? "Поставщик"
                  : "Покупатель"}
              </Label>
              <Select
                value={counterpartyId}
                onValueChange={setCounterpartyId}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Контрагент" />
                </SelectTrigger>
                <SelectContent>
                  {(partners.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-1.5">
          <Label>Комментарий</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={locked}
            placeholder="Необязательно"
            rows={2}
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-display text-lg">Строки</h2>
          {!locked ? (
            <ProductPicker
              products={products.data ?? []}
              onPick={(p) =>
                setLines((prev) => [
                  ...prev,
                  {
                    key: `${p.id}-${Date.now()}`,
                    productId: p.id,
                    sku: p.sku,
                    name: p.name,
                    unit: p.unit,
                    qty: 1,
                    price: defaultPrice(type, p),
                  },
                ])
              }
            />
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-y border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">Кол-во</th>
                <th className="px-3 py-2 font-medium">Цена</th>
                <th className="px-3 py-2 text-right font-medium">Сумма</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{line.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.sku} · {line.unit}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0.001}
                      step="any"
                      value={line.qty}
                      disabled={locked}
                      className="h-9 w-24 tabular-nums"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? { ...l, qty: num(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.price}
                      disabled={locked}
                      className="h-9 w-32 tabular-nums"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? { ...l, price: num(e.target.value) }
                              : l,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(line.qty * line.price)}
                  </td>
                  <td className="px-2 py-2">
                    {!locked ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Удалить строку"
                        onClick={() =>
                          setLines((prev) => prev.filter((l) => l.key !== line.key))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    Добавьте товары — поиск по названию или артикулу
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-border md:hidden">
          {lines.map((line) => (
            <li key={line.key} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">{line.sku}</p>
                </div>
                {!locked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setLines((prev) => prev.filter((l) => l.key !== line.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={line.qty}
                  disabled={locked}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, qty: num(e.target.value) } : l,
                      ),
                    )
                  }
                />
                <Input
                  type="number"
                  value={line.price}
                  disabled={locked}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, price: num(e.target.value) } : l,
                      ),
                    )
                  }
                />
              </div>
              <p className="text-right text-sm tabular-nums">
                {money(line.qty * line.price)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {initial?.status === "posted" && initial.moves.length > 0 ? (
        <div className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <h2 className="mb-3 font-display text-lg">Движение склада</h2>
          <ul className="space-y-2 text-sm">
            {initial.moves.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <span>
                  {m.productName}
                  <span className="block text-xs text-muted-foreground">
                    {m.warehouseName}
                  </span>
                </span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    m.qty < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {m.qty > 0 ? "+" : ""}
                  {qtyFmt(m.qty)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sticky bottom-16 z-20 mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] lg:bottom-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">в т.ч. НДС 12%</p>
            <p className="text-sm tabular-nums text-muted-foreground">{money(vat)}</p>
            <p className="mt-1 font-display text-2xl tabular-nums tracking-tight">
              {money(amount)}
            </p>
            {initial && moneyTypes.includes(type) ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Оплачено {money(initial.paidAmount)}
                {initial.dueAmount > 0 ? ` · долг ${money(initial.dueAmount)}` : " · закрыто"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canPay ? (
              <Button variant="outline" onClick={() => setPayOpen(true)}>
                {SUPPLIER_DOC.includes(type) ? "Оплатить поставщику" : "Принять оплату"}
              </Button>
            ) : null}
            {canTransit ? (
              <Button
                variant="outline"
                onClick={() => transitMut.mutate()}
                disabled={transitMut.isPending}
              >
                Товар в пути
              </Button>
            ) : null}
            {canFollow && FOLLOW_LABEL[type] ? (
              <Button
                variant="outline"
                onClick={() => followMut.mutate(FOLLOW_TO[type])}
                disabled={followMut.isPending}
              >
                {FOLLOW_LABEL[type]}
              </Button>
            ) : null}
            {canShip && type === "order" ? (
              <Button
                variant="outline"
                onClick={() => followMut.mutate("sale")}
                disabled={followMut.isPending}
              >
                Отгрузить
              </Button>
            ) : null}
            {locked ? (
              <Button
                variant="outline"
                onClick={() => unpostMut.mutate()}
                disabled={unpostMut.isPending}
              >
                Отменить проведение
              </Button>
            ) : (
              <>
                {initial ? (
                  <Button
                    variant="ghost"
                    onClick={() => delMut.mutate()}
                    disabled={delMut.isPending}
                  >
                    Удалить
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => saveMut.mutate(false)}
                  disabled={saveMut.isPending || lines.length === 0}
                >
                  Сохранить черновик
                </Button>
                <Button
                  onClick={() =>
                    initial
                      ? initial.status === "draft"
                        ? saveMut.mutate(true)
                        : postMut.mutate()
                      : saveMut.mutate(true)
                  }
                  disabled={saveMut.isPending || postMut.isPending || lines.length === 0}
                >
                  Провести
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {initial && moneyTypes.includes(type) && initial.payments.length > 0 ? (
        <div className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
          <h2 className="mb-3 font-display text-lg">Оплаты</h2>
          <ul className="space-y-2 text-sm">
            {initial.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span>
                  {p.number}
                  <span className="block text-xs text-muted-foreground">
                    {p.payDate} · {p.method}
                  </span>
                </span>
                <span className="tabular-nums font-medium">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        defaultKind={SUPPLIER_DOC.includes(type) ? "out" : "in"}
        partnerId={initial?.counterpartyId}
        documentId={initial?.id}
        suggestedAmount={initial?.dueAmount}
      />
    </div>
  );
}

export function DocumentPage({ id }: { id: number }) {
  const q = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDocument({ data: { id } }),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка документа…</p>;
  }
  if (q.error || !q.data) {
    return (
      <p className="text-sm text-destructive">
        {(q.error as Error | undefined)?.message ?? "Документ не найден"}
      </p>
    );
  }
  return <DocumentForm initial={q.data} defaultType={q.data.type} />;
}
