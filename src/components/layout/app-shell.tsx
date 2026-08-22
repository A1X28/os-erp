import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  Warehouse,
  Package,
  Building2,
  ChartNoAxesCombined,
  Plus,
  Menu,
  Users,
  Banknote,
  CalendarRange,
  Landmark,
} from "lucide-react";
import { APP_NAME, COMPANY, DOC_TYPE_LABEL } from "@/lib/erp/labels";
import type { DocType } from "@/lib/erp/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserButton, RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMe } from "@/lib/erp/server";
import { useQuery } from "@tanstack/react-query";

const GROUPS = [
  {
    label: "Операции",
    items: [
      { to: "/", label: "Дашборд", icon: LayoutDashboard },
      { to: "/documents", label: "Документы", icon: FileText },
      { to: "/money", label: "Деньги", icon: Banknote },
      { to: "/stock", label: "Остатки", icon: Warehouse },
    ],
  },
  {
    label: "Справочники",
    items: [
      { to: "/catalog", label: "Номенклатура", icon: Package },
      { to: "/partners", label: "Контрагенты", icon: Building2 },
    ],
  },
  {
    label: "Аналитика",
    items: [{ to: "/reports", label: "Отчёты", icon: ChartNoAxesCombined }],
  },
  {
    label: "Компания",
    items: [
      { to: "/company", label: "Профиль", icon: Landmark },
      { to: "/staff", label: "Сотрудники", icon: Users },
      { to: "/periods", label: "Периоды", icon: CalendarRange },
    ],
  },
] as const;

const CREATE: { type: DocType; hint: string }[] = [
  { type: "po", hint: "Заказать у поставщика" },
  { type: "bill", hint: "Счёт на оплату поставщику" },
  { type: "purchase", hint: "Принять товар на склад" },
  { type: "order", hint: "Заявка покупателя" },
  { type: "invoice", hint: "Счёт покупателю" },
  { type: "sale", hint: "Отгрузить со склада" },
  { type: "sale_return", hint: "Товар вернулся от клиента" },
  { type: "purchase_return", hint: "Вернуть товар поставщику" },
  { type: "transfer", hint: "Между складами" },
  { type: "writeoff", hint: "Бой, порча, недостача" },
  { type: "inventory", hint: "Пересчёт. Выровняет остаток до факта" },
];

const MOBILE_TABS = [
  { to: "/", label: "Обзор", icon: LayoutDashboard },
  { to: "/documents", label: "Документы", icon: FileText },
  { to: "/stock", label: "Склад", icon: Warehouse },
  { to: "/catalog", label: "Товары", icon: Package },
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function AxisMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary-foreground/15" />
      <path
        d="M7 16h18M16 7v18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
    </svg>
  );
}

function NavLinks({
  pathname,
  onNavigate,
  owner,
}: {
  pathname: string;
  onNavigate?: () => void;
  owner: boolean;
}) {
  return (
    <nav className="flex flex-col gap-5">
      {GROUPS.map((group) => {
        const items =
          group.label === "Компания" && !owner
            ? []
            : group.items;
        if (items.length === 0) return null;
        return (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const on = isActive(pathname, item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                      on
                        ? "bg-muted text-foreground"
                        : "text-foreground/80 hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}

function CreateMenu({ compact }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={compact ? "sm" : "default"} className={compact ? "h-10 px-3" : ""}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Создать</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Новый документ</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Закупка</DropdownMenuLabel>
        {CREATE.filter((i) => i.type === "po" || i.type === "bill" || i.type === "purchase").map(
          (item) => (
            <DropdownMenuItem key={item.type} asChild>
              <Link to="/documents/new" search={{ type: item.type }}>
                <span className="flex flex-col">
                  <span>{DOC_TYPE_LABEL[item.type]}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Продажа</DropdownMenuLabel>
        {CREATE.filter((i) => i.type === "order" || i.type === "invoice" || i.type === "sale").map(
          (item) => (
            <DropdownMenuItem key={item.type} asChild>
              <Link to="/documents/new" search={{ type: item.type }}>
                <span className="flex flex-col">
                  <span>{DOC_TYPE_LABEL[item.type]}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Возвраты</DropdownMenuLabel>
        {CREATE.filter((i) => i.type === "sale_return" || i.type === "purchase_return").map(
          (item) => (
            <DropdownMenuItem key={item.type} asChild>
              <Link to="/documents/new" search={{ type: item.type }}>
                <span className="flex flex-col">
                  <span>{DOC_TYPE_LABEL[item.type]}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
        {CREATE.filter((i) => i.type === "transfer" || i.type === "writeoff" || i.type === "inventory").map((item) => (
          <DropdownMenuItem key={item.type} asChild>
            <Link to="/documents/new" search={{ type: item.type }}>
              <span className="flex flex-col">
                <span>{DOC_TYPE_LABEL[item.type]}</span>
                <span className="text-xs text-muted-foreground">{item.hint}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/money" search={{ new: "in" }}>
            <span className="flex flex-col">
              <span>Оплата от клиента</span>
              <span className="text-xs text-muted-foreground">Получил деньги</span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/money" search={{ new: "out" }}>
            <span className="flex flex-col">
              <span>Оплата поставщику</span>
              <span className="text-xs text-muted-foreground">Заплатил за товар</span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => getMe(),
    enabled: Boolean(user) && pathname !== "/login",
  });
  const owner = me.data?.role !== "staff";

  if (pathname === "/login" || pathname.includes("/print")) {
    return <>{children}</>;
  }

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!user) {
    return <RedirectToSignIn />;
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <AxisMark className="size-8 text-foreground" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight tracking-tight">{APP_NAME}</p>
            <p className="truncate text-xs text-muted-foreground">{COMPANY}</p>
          </div>
        </div>
        <div className="flex-1 px-2 py-1">
          <NavLinks pathname={pathname} owner={owner} />
        </div>
        <div className="flex items-center justify-between px-3 py-3">
          <p className="text-xs text-muted-foreground">Учёт без лишнего шума</p>
          <ThemeToggle compact />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-3 py-2 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md"
            onClick={() => setOpen(true)}
            aria-label="Меню"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/" className="font-display text-base tracking-tight">
            {APP_NAME}
          </Link>
          <CreateMenu compact />
        </header>

        <div className="hidden items-center justify-end gap-2 px-6 pt-5 lg:flex">
          <ThemeToggle />
          <UserButton />
          <CreateMenu />
        </div>

        <main className="flex-1 px-3 pb-24 pt-4 sm:px-6 lg:pb-10 lg:pt-2">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
        <ul className="grid grid-cols-4">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const on = isActive(pathname, tab.to);
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    on ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-card">
          <SheetHeader>
            <SheetTitle>{APP_NAME}</SheetTitle>
            <p className="text-xs text-muted-foreground">{COMPANY}</p>
          </SheetHeader>
          <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} owner={owner} />
          <div className="mt-6 flex items-center justify-between px-3">
            <UserButton />
            <ThemeToggle compact />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
