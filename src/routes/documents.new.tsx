import { createFileRoute } from "@tanstack/react-router";
import { DocumentForm } from "@/components/erp/document-form";
import { isDocType } from "@/lib/erp/types";

export const Route = createFileRoute("/documents/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    type: isDocType(search.type) ? search.type : ("sale" as const),
  }),
  component: NewDocumentPage,
});

function NewDocumentPage() {
  const { type } = Route.useSearch();
  return <DocumentForm defaultType={type} />;
}
