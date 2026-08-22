import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/erp/document-form";

export const Route = createFileRoute("/documents/$id")({
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { id } = Route.useParams();
  return <DocumentPage id={Number(id)} />;
}
