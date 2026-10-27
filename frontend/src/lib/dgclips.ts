/** Server-only readiness flag. No credentials are sent to the browser. */
export function workspaceConfigured() {
  return process.env.DGCLIPS_DEMO !== "true" && Boolean(
    process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.BACKEND_AUTH_SECRET &&
    (process.env.DGCLIPS_BACKEND_URL || process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL),
  );
}
