import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  experimental: { cpus: 2 },
  // Equivalent to next-intl's request-config alias without loading its optional
  // native message-precompilation toolchain. Both bundlers use the same catalog.
  turbopack: { resolveAlias: { "next-intl/config": "./src/i18n/request.ts" } },
  webpack(config) {
    config.resolve.alias["next-intl/config"] = path.join(root, "src/i18n/request.ts");
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ] }];
  },
};
export default config;
