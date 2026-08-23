import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAccount,
  deletePayment,
  deleteTransfer,
  listAccounts,
  listPayments,
  listTransfers,
  saveAccount,
  saveTransfer,
} from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { formatDate, money, todayIso } from "@/lib/erp/format";
import { CURRENCIES, PAY_METHODS } from "@/lib/erp/types";
import { PAY_KIND_LABEL, PAY_METHOD_LABEL } from "@/lib/erp/labels";
import type { Currency, MoneyAccount, PayKind, PayMethod } from "@/lib/erp/types";
import { PaymentDialog } from "@/components/erp/payment-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/money")({
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === "in" || search.new === "out" ? search.new : undefined,
  }),
  loader: async () => {
    const [payments, accounts, transfers] = await Promise.all([
      orGuest(listPayments({ data: { kind: "all" } }), []),
      orGuest(listAccounts(), []),
      orGuest(listTransfers(), []),
    ]);
    return { payments, accounts, transfers };
  },
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
  const [moveOpen, setMoveOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [editing, setEditing] = useState<MoneyAccount | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["payments", q, kind],
    queryFn: () => listPayments({ data: { q, kind } }),
    initialData: q === "" && kind === "all" ? initial.payments : undefined,
    initialDataUpdatedAt: q === "" && kind === "all" ? Date.now() : undefined,
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
    initialData: initial.accounts,
    initialDataUpdatedAt: Date.now(),
  });
  const transfers = useQuery({
    queryKey: ["transfers"],
    queryFn: () => listTransfers(),
    initialData: initial.transfers,
    initialDataUpdatedAt: Date.now(),
  });
  const rows = list.data ?? [];
  const accs = accounts.data ?? [];

  const del = useMutation({
    mutationFn: (id: number) => deletePayment({ data: { id } }),
    onSuccess: () => {
      toast.success("Оплата удалена");
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
  });
  const delMove = useMutation({
    mutationFn: (id: number) => deleteTransfer({ data: { id } }),
    onSuccess: () => {
      toast.success("Перемещение отменено");
      void qc.invalidateQueries({ queryKey: ["transfers"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось отменить"),
  });
  const delAcc = useMutation({
    mutationFn: (id: number) => deleteAccount({ data: { id } }),
    onSuccess: () => {
      toast.success("Счёт удалён");
      void qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Деньги</h1>
          <p className="mt-1 text-sm text-muted-foreground">Свои кассы и банки</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setAccOpen(true);
            }}
          >
            Новый счёт
          </Button>
          <Button variant="outline" onClick={() => setMoveOpen(true)}>
            Переместить
          </Button>
          <Button variant="outline" onClick={() => setPayOpen("out")}>
            Поставщику
          </Button>
          <Button onClick={() => setPayOpen("in")}>От клиента</Button>
        </div>
      </div>

      {accs.length === 0 ? (
        <div className="mb-4 rounded-xl bg-card px-5 py-8 text-center shadow-[var(--shadow-border)]">
          <p className="text-sm text-muted-foreground">
            Добавьте кассу или банк — как они у вас называются. Kaspi, расчётный, наличные.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setEditing(null);
              setAccOpen(true);
            }}
          >
            Новый счёт
          </Button>
        </div>
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {accs.map((a) => (
            <div key={a.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground">
                {PAY_METHOD_LABEL[a.kind]} · {a.currency}
              </p>
              <p className="mt-2 font-display text-2xl tabular-nums tracking-tight">
                {money(a.balance, { currency: a.currency })}
              </p>
              <div className="mt-2 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(a);
                    setAccOpen(true);
                  }}
                >
                  Изменить
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => delAcc.mutate(a.id)}
                >
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                    {formatDate(row.payDate)} · {row.accountName}
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
                  {money(row.amount, { currency: row.currency })}
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

      {(transfers.data ?? []).length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
          <h2 className="px-4 pt-4 font-display text-lg">Перемещения</h2>
          <ul className="mt-2 divide-y divide-border">
            {(transfers.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{t.number}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(t.payDate)} · {t.fromName} → {t.toName}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{money(t.amount, { currency: t.currency })}</span>
                  <Button variant="ghost" size="sm" onClick={() => delMove.mutate(t.id)}>
                    Удалить
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PaymentDialog
        open={payOpen !== null}
        onOpenChange={(v) => {
          if (!v) setPayOpen(null);
        }}
        defaultKind={payOpen ?? "in"}
      />
      <TransferDialog open={moveOpen} onOpenChange={setMoveOpen} />
      <AccountDialog
        open={accOpen}
        account={editing}
        onOpenChange={(v) => {
          setAccOpen(v);
          if (!v) setEditing(null);
        }}
      />
    </div>
  );
}

function TransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(todayIso());
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
    enabled: open,
  });
  const accs = accounts.data ?? [];
  const from = accs.find((a) => String(a.id) === fromId);
  const dest = accs.filter((a) => !from || (a.currency === from.currency && a.id !== from.id));

  const mut = useMutation({
    mutationFn: () =>
      saveTransfer({
        data: {
          payDate,
          fromId: Number(fromId),
          toId: Number(toId),
          amount: Number(amount),
        },
      }),
    onSuccess: () => {
      toast.success("Перемещено");
      onOpenChange(false);
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Переместить</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label>Откуда</Label>
            <Select value={fromId} onValueChange={(v) => { setFromId(v); setToId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Счёт" />
              </SelectTrigger>
              <SelectContent>
                {accs.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} · {money(a.balance, { currency: a.currency })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Куда</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Счёт" />
              </SelectTrigger>
              <SelectContent>
                {dest.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Дата</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Сумма</Label>
              <Input
                type="number"
                min={0.01}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending || !fromId || !toId}>
              Переместить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: MoneyAccount | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PayMethod>("bank");
  const [currency, setCurrency] = useState<Currency>("RUB");

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? "bank");
    setCurrency(account?.currency ?? "RUB");
  }, [open, account]);

  const mut = useMutation({
    mutationFn: () =>
      saveAccount({
        data: account
          ? { id: account.id, name }
          : { name, kind, currency },
      }),
    onSuccess: () => {
      toast.success(account ? "Счёт сохранён" : "Счёт создан");
      onOpenChange(false);
      setName("");
      void qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Счёт" : "Новый счёт"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kaspi, касса, расчётный…"
              required
            />
          </div>
          {account ? (
            <p className="text-xs text-muted-foreground">
              {PAY_METHOD_LABEL[account.kind]} · {account.currency}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Тип</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as PayMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {PAY_METHOD_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Валюта</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending || !name.trim()}>
              {account ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
