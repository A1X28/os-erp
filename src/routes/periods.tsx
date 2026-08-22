import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { closePeriod, listPeriods, reopenPeriod } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/periods")({
  loader: () => orGuest(listPeriods(), []),
  component: PeriodsPage,
});

function PeriodsPage() {
  const initial = Route.useLoaderData();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["periods"],
    queryFn: () => listPeriods(),
    initialData: initial,
    initialDataUpdatedAt: Date.now(),
  });
  const rows = list.data ?? [];

  const closeMut = useMutation({
    mutationFn: (row: { year: number; month: number }) =>
      closePeriod({ data: row }),
    onSuccess: () => {
      toast.success("Месяц закрыт");
      void qc.invalidateQueries({ queryKey: ["periods"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Не закрылся");
    },
  });

  const openMut = useMutation({
    mutationFn: (row: { year: number; month: number }) =>
      reopenPeriod({ data: row }),
    onSuccess: () => {
      toast.success("Месяц снова открыт");
      void qc.invalidateQueries({ queryKey: ["periods"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Не открылся");
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="font-display text-3xl tracking-tight">Периоды</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Закрытый месяц нельзя провести, отменить или оплатить. Закрывайте
          подряд, начиная с первого законченного месяца. Открыть можно только
          последний.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Месяц</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-4 py-3 font-medium">Кто закрыл</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.year}-${row.month}`} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3">
                  {row.closed ? (
                    <span className="text-muted-foreground">Закрыт</span>
                  ) : (
                    <span>Открыт</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.closed
                    ? [row.closedEmail, row.closedAt].filter(Boolean).join(" · ")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.canReopen ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={openMut.isPending}
                      onClick={() => openMut.mutate({ year: row.year, month: row.month })}
                    >
                      Открыть
                    </Button>
                  ) : row.canClose ? (
                    <Button
                      size="sm"
                      disabled={closeMut.isPending}
                      onClick={() => closeMut.mutate({ year: row.year, month: row.month })}
                    >
                      Закрыть
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
