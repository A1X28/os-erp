import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { listPartners } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { money } from "@/lib/erp/format";
import { KIND_LABEL } from "@/lib/erp/labels";
import type { PartnerKind } from "@/lib/erp/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PartnerDialog } from "@/components/erp/partner-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partners/")({
  loader: () => orGuest(listPartners({ data: { q: "", kind: "all" } }), []),
  component: PartnersPage,
});

function PartnersPage() {
  const initial = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | PartnerKind>("all");
  const [creating, setCreating] = useState(false);
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
        <Button onClick={() => setCreating(true)}>Новый контрагент</Button>
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
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          void qc.invalidateQueries({ queryKey: ["partners"] });
        }}
      />
    </div>
  );
}
