import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/documents")({
  component: DocumentsLayout,
});

function DocumentsLayout() {
  return <Outlet />;
}
