import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listAccounts, listPartners, savePayment } from "@/lib/erp/server";
import { PAY_KIND_LABEL } from "@/lib/erp/labels";
import { money, todayIso } from "@/lib/erp/format";
import type { Currency, PayKind } from "@/lib/erp/types";
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

export function PaymentDialog({
  open,
  onOpenChange,
  defaultKind,
  partnerId,
  documentId,
  suggestedAmount,
  currency,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultKind: PayKind;
  partnerId?: number | null;
  documentId?: number | null;
  suggestedAmount?: number;
  currency?: Currency;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PayKind>(defaultKind);
  const [payDate, setPayDate] = useState(todayIso());
  const [partner, setPartner] = useState(partnerId ? String(partnerId) : "");
  const [amount, setAmount] = useState(
    suggestedAmount && suggestedAmount > 0 ? String(suggestedAmount) : "",
  );
  const [accountId, setAccountId] = useState("");
  const [comment, setComment] = useState("");

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
    enabled: open,
  });
  const accountList = useMemo(() => {
    const all = accounts.data ?? [];
    if (!currency) return all;
    return all.filter((a) => a.currency === currency);
  }, [accounts.data, currency]);

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setPayDate(todayIso());
    setPartner(partnerId ? String(partnerId) : "");
    setAmount(suggestedAmount && suggestedAmount > 0 ? String(Math.round(suggestedAmount)) : "");
    setComment("");
  }, [open, defaultKind, partnerId, suggestedAmount]);

  useEffect(() => {
    if (!open) return;
    if (accountList.some((a) => String(a.id) === accountId)) return;
    const kaspi = accountList.find((a) => a.kind === "kaspi");
    const def = accountList.find((a) => a.isDefault) ?? accountList[0];
    setAccountId(String((kaspi ?? def)?.id ?? ""));
  }, [open, accountList, accountId]);

  const acc = accountList.find((a) => String(a.id) === accountId);
  const cur: Currency = acc?.currency ?? currency ?? "RUB";

  const partners = useQuery({
    queryKey: ["partners", "", kind === "out" ? "supplier" : "buyer"],
    queryFn: () =>
      listPartners({
        data: { kind: kind === "out" ? "supplier" : "buyer" },
      }),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      savePayment({
        data: {
          kind,
          payDate,
          partnerId: Number(partner),
          documentId: documentId ?? null,
          amount: Number(amount),
          accountId: Number(accountId),
          comment,
        },
      }),
    onSuccess: (row) => {
      toast.success(`${row.number} · ${money(row.amount, { currency: row.currency })}`);
      onOpenChange(false);
      void qc.invalidateQueries();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось провести оплату"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{PAY_KIND_LABEL[kind]}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!documentId ? (
            <div className="space-y-1.5">
              <Label>Тип</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as PayKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">{PAY_KIND_LABEL.in}</SelectItem>
                  <SelectItem value="out">{PAY_KIND_LABEL.out}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Дата</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label>{kind === "out" ? "Поставщик" : "Покупатель"}</Label>
            <Select value={partner} onValueChange={setPartner} disabled={Boolean(partnerId)}>
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
          <div className="space-y-1.5">
            <Label>Счёт</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Касса или банк" />
              </SelectTrigger>
              <SelectContent>
                {accountList.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} · {money(a.balance, { currency: a.currency })}
                  </SelectItem>
                ))}
                {accountList.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Нет счёта в этой валюте
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            {kind === "out" && acc ? (
              <p className="text-xs text-muted-foreground">
                Доступно {money(acc.balance, { currency: cur })}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Комментарий</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={save.isPending || !partner || !amount || !accountId}>
              {save.isPending ? "Провожу…" : "Провести оплату"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
