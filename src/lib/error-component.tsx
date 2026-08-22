import type { ErrorComponentProps } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { SIGN_IN_PATH } from "@/lib/auth/gates";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = error.message || "";
  if (message === "Unauthorized" || /unauthorized/i.test(message)) {
    return <Navigate to={SIGN_IN_PATH} />;
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <span className="text-destructive" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-lg font-medium">Что-то пошло не так</h1>
      <p className="max-w-md text-sm break-words text-muted-foreground">
        {message || "Неожиданная ошибка. Обновите страницу."}
      </p>
    </main>
  );
}