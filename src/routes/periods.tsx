import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  closePeriod,
  listPeriods,
  reopenPeriod,
  savePeriodSettings,
} from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PeriodBoard } from "@/lib/erp/types";

const emptyBoard: PeriodBoard = { autoClose: true, graceDays: 5, months: [] };

export const Route = createFileRoute("/periods")({
  loader: () => orGuest(listPeriods(), emptyBoard),
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
  const board = list.data ?? emptyBoard;
  const rows = board.months;
  const [grace, setGrace] = useState(String(board.graceDays));

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

  const settingsMut = useMutation({
    mutationFn: (data: { autoClose: boolean; graceDays: number }) =>
      savePeriodSettings({ data }),
    onSuccess: (next) => {
      toast.success("Автозакрытие обновлено");
      setGrace(String(next.graceDays));
      void qc.invalidateQueries({ queryKey: ["periods"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Не сохранилось");
    },
  });

  function saveGrace() {
    const n = Number(grace);
    if (!Number.isInteger(n) || n < 0 || n > 31) {
      toast.error("Пауза — от 0 до 31 дня");
      return;
    }
    settingsMut.mutate({ autoClose: board.autoClose, graceDays: n });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="font-display text-3xl tracking-tight">Периоды</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Прошлый месяц закрывается сам, когда выходит пауза. С этой датой
          нельзя провести, отменить или оплатить. Открыть вручную можно только
          последний.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-4 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={board.autoClose}
            disabled={settingsMut.isPending}
            onChange={(e) =>
              settingsMut.mutate({
                autoClose: e.target.checked,
                graceDays: board.graceDays,
              })
            }
          />
          Закрывать автоматически
        </label>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="grace">Пауза, дней после конца месяца</Label>
            <Input
              id="grace"
              className="mt-1 w-24"
              inputMode="numeric"
              value={grace}
              onChange={(e) => setGrace(e.target.value)}
              onBlur={saveGrace}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveGrace();
              }}
            />
          </div>
        </div>
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
                    <span className="text-muted-foreground">
                      Закрыт{row.auto ? " автоматически" : ""}
                    </span>
                  ) : row.closesOn ? (
                    <span className="text-muted-foreground">
                      Закроется {row.closesOn}
                    </span>
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
