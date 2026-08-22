import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { listPartners, savePartner } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { money } from "@/lib/erp/format";
import { KIND_LABEL } from "@/lib/erp/labels";
import type { Partner, PartnerKind } from "@/lib/erp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/partners/")({
  loader: () => orGuest(listPartners({ data: { q: "", kind: "all" } }), []),
  component: PartnersPage,
});

function PartnersPage() {
  const initial = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | PartnerKind>("all");
  const [editing, setEditing] = useState<Partner | null | "new">(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["partners", q, kind],
    queryFn: () => listPartners({ data: { q, kind } }),
    initialData: q === "" && kind === "all" ? initial : undefined,
    initialDataUpdatedAt: q === "" && kind === "all" ? Date.now() : undefined,
  });
  const rows = list.data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Контрагенты</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Покупатели и поставщики. В карточке — кто сколько должен.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>Новый контрагент</Button>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название или БИН"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Все"],
              ["buyer", "Покупатели"],
              ["supplier", "Поставщики"],
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
                  : "bg-muted text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)] divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              to="/partners/$id"
              params={{ id: String(p.id) }}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
            >
              <span>
                <span className="block font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.city}
                  {p.inn ? ` · БИН ${p.inn}` : ""}
                  {p.phone ? ` · ${p.phone}` : ""}
                </span>
              </span>
              <span className="text-right">
                <Badge variant="secondary">{KIND_LABEL[p.kind]}</Badge>
                {p.receivableBase > 0.009 ? (
                  <span className="mt-1 block text-xs tabular-nums">
                    нам {money(p.receivableBase)}
                  </span>
                ) : null}
                {p.payableBase > 0.009 ? (
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                    мы {money(p.payableBase)}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
        {!list.isLoading && rows.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            Никого нет
          </li>
        ) : null}
      </ul>

      <PartnerDialog
        open={editing !== null}
        partner={editing === "new" || editing === null ? undefined : editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          void qc.invalidateQueries({ queryKey: ["partners"] });
        }}
      />
    </div>
  );
}

function PartnerDialog({
  open,
  onOpenChange,
  onSaved,
  partner,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  partner?: Partner;
}) {
  const [name, setName] = useState(partner?.name ?? "");
  const [inn, setInn] = useState(partner?.inn ?? "");
  const [kind, setKind] = useState<PartnerKind>(partner?.kind ?? "buyer");
  const [city, setCity] = useState(partner?.city ?? "");
  const [phone, setPhone] = useState(partner?.phone ?? "");

  const mut = useMutation({
    mutationFn: () =>
      savePartner({
        data: { id: partner?.id, name, inn, kind, city, phone },
      }),
    onSuccess: () => {
      toast.success(partner ? "Сохранено" : "Контрагент создан");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {partner ? "Контрагент" : "Новый контрагент"}
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
              <Label>БИН</Label>
              <Input value={inn} onChange={(e) => setInn(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Город</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
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
