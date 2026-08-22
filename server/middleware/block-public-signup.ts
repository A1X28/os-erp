/**
 * Public self-serve sign-up is closed. New employees are created from
 * /staff (direct user+account insert), not via /api/auth/sign-up/email.
 */
export default async function blockPublicSignup(
  event: { url: URL; req: { method: string } },
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  const path = event.url.pathname;
  if (method === "POST" && path === "/api/auth/sign-up/email") {
    return new Response(JSON.stringify({ message: "Регистрация закрыта" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return next();
}
