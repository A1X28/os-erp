import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SettlePrint } from "@/components/erp/settle-print";
import { getCompany, getPartnerSettle } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { todayIso } from "@/lib/erp/format";
import { settlePeriod, yearStartIso } from "@/lib/erp/settle";
import { DEFAULT_COMPANY } from "@/lib/erp/types";
import { Button } from "@/components/ui/button";

function isoDate(v: unknown, fallback: string) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}

export const Route = createFileRoute("/print/partner/$id")({
  validateSearch: (search: Record<string, unknown>) => {
    const today = todayIso();
    return {
      from: isoDate(search.from, yearStartIso(today)),
      to: isoDate(search.to, today),
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const id = Number(params.id);
    const [settle, company] = await Promise.all([
      orGuest(getPartnerSettle({ data: { id } }), null),
      orGuest(getCompany(), DEFAULT_COMPANY),
    ]);
    return { settle, company, from: deps.from, to: deps.to };
  },
  component: SettlePrintPage,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.settle
          ? `Акт сверки — ${loaderData.settle.partner.name}`
          : "Акт сверки",
      },
    ],
  }),
});

function SettlePrintPage() {
  const { settle, company, from, to } = Route.useLoaderData();

  useEffect(() => {
    if (!settle) return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, [settle]);

  if (!settle) {
    return <p className="p-6 text-sm text-muted-foreground">Контрагент не найден</p>;
  }

  const periods = settlePeriod(settle.entries, from, to);

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="no-print mx-auto flex max-w-[190mm] items-center justify-between gap-3 px-1 py-4">
        <Button variant="outline" asChild>
          <Link to="/partners/$id" params={{ id: String(settle.partner.id) }}>
            Назад
          </Link>
        </Button>
        <Button onClick={() => window.print()}>Печать / PDF</Button>
      </div>
      <SettlePrint
        partner={settle.partner}
        company={company}
        from={from}
        to={to}
        periods={periods}
      />
    </div>
  );
}
