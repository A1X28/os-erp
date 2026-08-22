import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { APP_NAME, COMPANY } from "@/lib/erp/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPending && user) {
    void navigate({ to: "/" });
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          name: name.trim() || email,
          email: email.trim(),
          password,
        });
        if (err) throw new Error(err.message ?? "Не удалось создать учётку");
      } else {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(err.message ?? "Неверный email или пароль");
      }
      await authClient.getSession();
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl tracking-tight">{APP_NAME}</p>
          <p className="mt-1 text-sm text-muted-foreground">{COMPANY} · только для сотрудников</p>
        </div>

        <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
          {!authEnabled ? (
            <p className="text-sm text-muted-foreground">Вход отключён.</p>
          ) : (
            <>
              <div className="mb-4 flex rounded-lg bg-muted p-1">
                <button
                  type="button"
                  className={`h-8 flex-1 rounded-md text-xs font-medium ${
                    mode === "in"
                      ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setMode("in")}
                >
                  Войти
                </button>
                <button
                  type="button"
                  className={`h-8 flex-1 rounded-md text-xs font-medium ${
                    mode === "up"
                      ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setMode("up")}
                >
                  Регистрация
                </button>
              </div>

              <form className="space-y-3" onSubmit={onEmail}>
                {mode === "up" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Имя</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                  />
                </div>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Секунду…" : mode === "up" ? "Создать учётку" : "Войти"}
                </Button>
              </form>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <p className="relative mx-auto w-fit bg-card px-2 text-xs text-muted-foreground">
                  или
                </p>
              </div>

              <div className="space-y-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                  >
                    Продолжить через {p.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Книга общая. Без входа с улицы её не открыть.
        </p>
      </div>
    </main>
  );
}
