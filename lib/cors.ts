const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-zA-Z0-9]+$/;

export function isAllowedLocalOrExtensionOrigin(origin: string | null): boolean {
  return !origin || LOCAL_ORIGIN_PATTERN.test(origin) || EXTENSION_ORIGIN_PATTERN.test(origin);
}

export function localExtensionCorsHeaders(req?: Request): HeadersInit {
  const origin = req?.headers.get("origin") ?? null;
  const allowOrigin = isAllowedLocalOrExtensionOrigin(origin) ? origin ?? "http://localhost:3000" : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
