import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { createEmployee, listEmployees } from "@/lib/erp/server";
import { orGuest } from "@/lib/erp/safe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/staff")({
  loader: () => orGuest(listEmployees(), []),
  component: StaffPage,
});

function StaffPage() {
  const initial = Route.useLoaderData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["staff"],
    queryFn: () => listEmployees(),
    initialData: initial,
    initialDataUpdatedAt: Date.now(),
  });
  const rows = list.data ?? [];

  const save = useMutation({
    mutationFn: () =>
      createEmployee({
        data: { name: name.trim(), email: email.trim(), password },
      }),
    onSuccess: (row) => {
      toast.success(`Сотрудник ${row.email} создан`);
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Не удалось создать");
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Сотрудники</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Вход в Ось. Регистрация с улицы закрыта — учётку выдаёт тот, кто уже внутри.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Новый сотрудник</Button>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Имя</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">С</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.name || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.createdAt}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  Пока никого. Создайте первую учётку.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый сотрудник</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">Имя</Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-password">Пароль</Label>
              <Input
                id="staff-password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Не меньше 8 символов. Передайте лично.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Создаю…" : "Создать"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
