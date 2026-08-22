import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { getCompany, saveCompany } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { DEFAULT_COMPANY } from "@/lib/erp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/company")({
  loader: () => orGuest(getCompany(), DEFAULT_COMPANY),
  component: CompanyPage,
});

function CompanyPage() {
  const initial = Route.useLoaderData();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["company"],
    queryFn: () => getCompany(),
    initialData: initial,
    initialDataUpdatedAt: Date.now(),
  });
  const data = q.data ?? DEFAULT_COMPANY;

  const [name, setName] = useState(data.name);
  const [bin, setBin] = useState(data.bin);
  const [address, setAddress] = useState(data.address);
  const [phone, setPhone] = useState(data.phone);
  const [bank, setBank] = useState(data.bank);
  const [iik, setIik] = useState(data.iik);
  const [bik, setBik] = useState(data.bik);
  const [vatEnabled, setVatEnabled] = useState(data.vatEnabled);
  const [vatRate, setVatRate] = useState(String(data.vatRate));

  useEffect(() => {
    setName(data.name);
    setBin(data.bin);
    setAddress(data.address);
    setPhone(data.phone);
    setBank(data.bank);
    setIik(data.iik);
    setBik(data.bik);
    setVatEnabled(data.vatEnabled);
    setVatRate(String(data.vatRate));
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const rate = Number(vatRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        throw new Error("Ставка НДС — от 0 до 100");
      }
      return saveCompany({
        data: {
          name: name.trim(),
          bin: bin.trim(),
          address: address.trim(),
          phone: phone.trim(),
          bank: bank.trim(),
          iik: iik.trim(),
          bik: bik.trim(),
          vatEnabled,
          vatRate: vatEnabled ? rate : 0,
        },
      });
    },
    onSuccess: () => {
      toast.success("Профиль сохранён — печать возьмёт эти реквизиты");
      void qc.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Не сохранилось");
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="font-display text-3xl tracking-tight">Компания</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Реквизиты на счетах и накладных. НДС — только если вы плательщик: иначе
          на бланке его не будет.
        </p>
      </div>

      <form
        className="space-y-5 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="co-name">Название</Label>
            <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-bin">БИН / ИИН</Label>
            <Input id="co-bin" value={bin} onChange={(e) => setBin(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-phone">Телефон</Label>
            <Input id="co-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="co-address">Адрес</Label>
            <Input id="co-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-bank">Банк</Label>
            <Input id="co-bank" value={bank} onChange={(e) => setBank(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-iik">ИИК</Label>
            <Input id="co-iik" value={iik} onChange={(e) => setIik(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-bik">БИК</Label>
            <Input id="co-bik" value={bik} onChange={(e) => setBik(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={vatEnabled}
              onChange={(e) => setVatEnabled(e.target.checked)}
            />
            Плательщик НДС
          </label>
          {vatEnabled ? (
            <div>
              <Label htmlFor="co-vat">Ставка, %</Label>
              <Input
                id="co-vat"
                className="mt-1 w-24"
                inputMode="decimal"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">На бланках НДС не печатается</p>
          )}
        </div>

        <Button type="submit" disabled={save.isPending}>
          Сохранить
        </Button>
      </form>
    </div>
  );
}
