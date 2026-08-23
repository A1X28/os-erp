import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveAccount } from "@/lib/erp/server";
import { CURRENCIES, PAY_METHODS } from "@/lib/erp/types";
import { PAY_METHOD_LABEL } from "@/lib/erp/labels";
import type { Currency, MoneyAccount, PayMethod } from "@/lib/erp/types";
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

export function AccountDialog({
  open,
  onOpenChange,
  account,
  defaultCurrency,
  defaultKind,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account?: MoneyAccount | null;
  defaultCurrency?: Currency;
  defaultKind?: PayMethod;
  onSaved?: (row: MoneyAccount) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PayMethod>(defaultKind ?? "bank");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency ?? "RUB");

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? defaultKind ?? "bank");
    setCurrency(account?.currency ?? defaultCurrency ?? "RUB");
  }, [open, account, defaultCurrency, defaultKind]);

  const mut = useMutation({
    mutationFn: () =>
      saveAccount({
        data: account
          ? { id: account.id, name }
          : { name, kind, currency },
      }),
    onSuccess: (row) => {
      toast.success(account ? "Счёт сохранён" : "Счёт создан");
      onOpenChange(false);
      setName("");
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      onSaved?.(row);
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
