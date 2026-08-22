import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { savePartner } from "@/lib/erp/server";
import type { Partner, PartnerKind } from "@/lib/erp/types";
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

export function PartnerDialog({
  open,
  onOpenChange,
  onSaved,
  partner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (p: Partner) => void;
  partner?: Partner;
}) {
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [kind, setKind] = useState<PartnerKind>("buyer");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [bank, setBank] = useState("");
  const [iik, setIik] = useState("");
  const [bik, setBik] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(partner?.name ?? "");
    setInn(partner?.inn ?? "");
    setKind(partner?.kind ?? "buyer");
    setCity(partner?.city ?? "");
    setAddress(partner?.address ?? "");
    setPhone(partner?.phone ?? "");
    setBank(partner?.bank ?? "");
    setIik(partner?.iik ?? "");
    setBik(partner?.bik ?? "");
  }, [open, partner]);

  const mut = useMutation({
    mutationFn: () =>
      savePartner({
        data: {
          id: partner?.id,
          name,
          inn,
          kind,
          city,
          address,
          phone,
          bank,
          iik,
          bik,
        },
      }),
    onSuccess: (saved) => {
      toast.success(partner ? "Сохранено" : "Контрагент создан");
      onSaved(saved);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {partner ? "Реквизиты" : "Новый контрагент"}
          </DialogTitle>
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
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label>Тип</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as PartnerKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer">Покупатель</SelectItem>
                <SelectItem value="supplier">Поставщик</SelectItem>
                <SelectItem value="both">Покупатель и поставщик</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>БИН / ИНН</Label>
              <Input value={inn} onChange={(e) => setInn(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Город</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Адрес</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Банк</Label>
            <Input value={bank} onChange={(e) => setBank(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>ИИК / р/с</Label>
              <Input value={iik} onChange={(e) => setIik(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>БИК</Label>
              <Input value={bik} onChange={(e) => setBik(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mut.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
