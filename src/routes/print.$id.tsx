import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DocumentPrint } from "@/components/erp/document-print";
import { getCompany, getDocument } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { DEFAULT_COMPANY } from "@/lib/erp/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/print/$id")({
  loader: async ({ params }) => {
    const id = Number(params.id);
    const [doc, company] = await Promise.all([
      orGuest(getDocument({ data: { id } }), null),
      orGuest(getCompany(), DEFAULT_COMPANY),
    ]);
    return { doc, company };
  },
  component: PrintPage,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.doc
          ? `${loaderData.doc.number} — печать`
          : "Печать документа",
      },
    ],
  }),
});

function PrintPage() {
  const { doc, company } = Route.useLoaderData();

  useEffect(() => {
    if (!doc) return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, [doc]);

  if (!doc) {
    return <p className="p-6 text-sm text-muted-foreground">Документ не найден</p>;
  }

  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="no-print mx-auto flex max-w-[190mm] items-center justify-between gap-3 px-1 py-4">
        <Button variant="outline" asChild>
          <Link to="/documents/$id" params={{ id: String(doc.id) }}>
            Назад
          </Link>
        </Button>
        <Button onClick={() => window.print()}>Печать / PDF</Button>
      </div>
      <DocumentPrint doc={doc} company={company} />
    </div>
  );
}
