import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DocumentPrint } from "@/components/erp/document-print";
import { getDocument } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/print/$id")({
  loader: ({ params }) =>
    orGuest(getDocument({ data: { id: Number(params.id) } }), null),
  component: PrintPage,
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.number} — печать`
          : "Печать документа",
      },
    ],
  }),
});

function PrintPage() {
  const doc = Route.useLoaderData();

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
      <DocumentPrint doc={doc} />
    </div>
  );
}
