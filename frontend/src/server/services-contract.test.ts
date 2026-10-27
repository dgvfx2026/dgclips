import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBackendUrl, getBackendApiBaseUrl } from "./backend-api";
afterEach(() => vi.unstubAllEnvs());
describe("Vercel service contract", () => {
  it("uses the injected URL at request time and preserves an internal path prefix", () => {
    vi.stubEnv("DGCLIPS_BACKEND_URL", "https://private.vercel.internal/services/backend/");
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://legacy:8000");
    expect(getBackendApiBaseUrl()).toBe("https://private.vercel.internal/services/backend");
    expect(buildBackendUrl("/tasks/one?view=clips")).toBe("https://private.vercel.internal/services/backend/tasks/one?view=clips");
  });
  it("keeps login routes on Next.js and declares private bindings on callers", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "../vercel.json"), "utf8"));
    expect(config.rewrites).toEqual([{ source: "/(.*)", destination: { service: "frontend" } }]);
    expect(config.services.frontend.bindings[0]).toEqual({ type: "service", service: "backend", format: "url", env: "DGCLIPS_BACKEND_URL" });
    expect(config.services.mcp.bindings[0].service).toBe("backend");
    expect(config.daemons.worker.command).toContain("src.vercel_worker");
  });
});
