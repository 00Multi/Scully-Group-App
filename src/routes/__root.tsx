import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SettingsProvider, useSettings } from "../lib/settings";
import { Moon, Sun } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl">404</h1>
        <h2 className="mt-4 text-xl">Not in the record</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page isn't part of the corrosion review database.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Refresh or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Structured database of molten-salt corrosion literature: browse papers, edit per-experiment fields, filter by alloy type, and export a machine-readable dataset.",
      },
      { name: "author", content: "Scully Group, UVA" },
      { property: "og:title", content: "Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Molten-salt corrosion literature, structured for humans and models.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={
        "px-3 py-1.5 text-sm transition-colors " +
        (active
          ? "text-foreground border-b border-primary"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useSettings();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      className="ml-2 inline-flex items-center justify-center rounded-md border border-rule px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-rule bg-paper/80 backdrop-blur sticky top-0 z-20">
            <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
              <Link to="/" className="flex items-baseline gap-2">
                <span className="text-2xl font-serif italic">Corrosion</span>
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Lit Review
                </span>
              </Link>
              <nav className="flex items-center gap-1">
                <NavLink to="/">Dashboard</NavLink>
                <NavLink to="/browse">Browse</NavLink>
                <NavLink to="/trends">Trends</NavLink>
                <NavLink to="/bulk">Bulk</NavLink>
                <NavLink to="/import">Import</NavLink>
                <NavLink to="/export">Export</NavLink>
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
