import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listPartners, savePayment } from "@/lib/erp/server";
import { PAY_KIND_LABEL, PAY_METHOD_LABEL } from "@/lib/erp/labels";
import { todayIso } from "@/lib/erp/format";
import type { PayKind, PayMethod } from "@/lib/erp/types";
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultKind: PayKind;
  partnerId?: number | null;
  documentId?: number | null;
  suggestedAmount?: number;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<PayKind>(defaultKind);
  const [payDate, setPayDate] = useState(todayIso());
  const [partner, setPartner] = useState(partnerId ? String(partnerId) : "");
  const [amount, setAmount] = useState(
    suggestedAmount && suggestedAmount > 0 ? String(suggestedAmount) : "",
  );
  const [method, setMethod] = useState<PayMethod>("kaspi");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setPayDate(todayIso());
    setPartner(partnerId ? String(partnerId) : "");
    setAmount(suggestedAmount && suggestedAmount > 0 ? String(Math.round(suggestedAmount)) : "");
    setMethod("kaspi");
    setComment("");
  }, [open, defaultKind, partnerId, suggestedAmount]);

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
          method,
          comment,
        },
      }),
    onSuccess: (row) => {
      toast.success(`${row.number} на ${row.amount} ₸`);
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
              <Label>Сумма, ₸</Label>
              <Input
                type="number"
                min={1}
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
            <Label>Способ</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAY_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Комментарий</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={save.isPending || !partner || !amount}>
              {save.isPending ? "Провожу…" : "Провести оплату"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
