import { createFileRoute } from "@tanstack/react-router";
import { withDb } from "@/lib/erp/db";

function allowed(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret =
    process.env.CRON_SECRET || process.env.BETTER_AUTH_SECRET || "";
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export const Route = createFileRoute("/api/cron/periods")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!allowed(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const sql = await withDb();
        const rows = await sql.query<{ os_auto_close_periods: number }>(
          "select os_auto_close_periods()",
        );
        return Response.json({
          closed: Number(rows[0]?.os_auto_close_periods ?? 0),
        });
      },
    },
  },
});
