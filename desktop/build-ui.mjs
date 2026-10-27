import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const desktop = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(desktop, "../frontend");
const require = createRequire(path.join(frontend, "package.json"));
const viteRequire = createRequire(require.resolve("vitest/package.json"));
const { build } = await import(pathToFileURL(viteRequire.resolve("vite")).href);
const ts = require("typescript");
const alias = [
  { find: "next/link", replacement: path.join(desktop, "ui/next-link.ts") },
  { find: "next/image", replacement: path.join(desktop, "ui/next-image.ts") },
  { find: "next/navigation", replacement: path.join(desktop, "ui/adapters.tsx") },
  { find: "@/lib/auth-client", replacement: path.join(desktop, "ui/adapters.tsx") },
  { find: "@/lib/video-upload", replacement: path.join(desktop, "ui/upload.ts") },
  { find: "@", replacement: path.join(frontend, "src") },
  ...["react", "react-dom", "lucide-react", "sonner", "motion", "radix-ui", "next-themes", "clsx", "tailwind-merge", "class-variance-authority"].map(name => ({ find: name, replacement: fs.realpathSync.native(path.join(frontend, "node_modules", name)) })),
];
try { await build({
  configFile: false,
  root: path.join(desktop, "ui"),
  publicDir: path.join(desktop, "ui/public"),
  resolve: { alias, dedupe: ["react", "react-dom"], preserveSymlinks: true },
  keepProcessEnv: true,
  esbuild: false,
  plugins: [{ name: "desktop-typescript", enforce: "pre", transform(code, id) {
    if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
    const source = code.replace(/process\.env\.NODE_ENV/g, '"production"').replace(/process\.env\.[A-Z_]+/g, "undefined");
    if (!/\.[cm]?tsx?$/.test(id)) return { code: source, map: null };
    return { code: ts.transpileModule(source, { fileName: id, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, esModuleInterop: true } }).outputText, map: null };
  } }],
  css: { postcss: { plugins: [require("@tailwindcss/postcss")()] } },
  build: { outDir: path.join(desktop, "ui-dist"), emptyOutDir: true, target: "esnext", minify: false, cssMinify: false, sourcemap: false, chunkSizeWarningLimit: 2000, rollupOptions: { onwarn(warning, warn) { if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning); } } },
}); } catch (error) { console.error(error.message); process.exitCode = 1; }
