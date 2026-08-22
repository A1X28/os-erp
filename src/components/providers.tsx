import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 8_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            className:
              "font-sans border-border bg-card text-foreground shadow-[var(--shadow-border)]",
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
