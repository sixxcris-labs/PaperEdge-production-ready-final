const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-zA-Z0-9]+$/;

export function isAllowedLocalOrExtensionOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return LOCAL_ORIGIN_PATTERN.test(origin) || EXTENSION_ORIGIN_PATTERN.test(origin);
}

export function localExtensionCorsHeaders(
  req?: Request,
  methods = "GET, POST, OPTIONS",
): HeadersInit {
  const origin = req?.headers.get("origin") ?? null;
  const allowOrigin = isAllowedLocalOrExtensionOrigin(origin)
    ? origin ?? "http://localhost:3000"
    : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function rejectDisallowedOrigin(
  req: Request,
  methods = "GET, POST, OPTIONS",
): Response | null {
  const origin = req.headers.get("origin") ?? null;
  if (isAllowedLocalOrExtensionOrigin(origin)) {
    return null;
  }

  return new Response(JSON.stringify({ error: "Origin not allowed" }), {
    status: 403,
    headers: {
      ...localExtensionCorsHeaders(req, methods),
      "Content-Type": "application/json",
    },
  });
}
