import { Badge } from "@/components/ui/badge";
import { DOC_TYPE_LABEL, STATUS_LABEL } from "@/lib/erp/labels";
import type { DocStatus, DocType } from "@/lib/erp/types";

export function StatusBadge({ status }: { status: DocStatus }) {
  return (
    <Badge variant={status === "posted" ? "posted" : "draft"}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: DocType }) {
  return <Badge variant="outline">{DOC_TYPE_LABEL[type]}</Badge>;
}
