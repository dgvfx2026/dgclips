import { NextResponse } from "next/server";
import { workspaceConfigured } from "@/lib/dgclips";
async function handle(request: Request, method: "GET" | "POST") {
  if (!workspaceConfigured()) return NextResponse.json({ error: "Configure o servidor para ativar a autenticação." }, { status: 503 });
  const [{ auth }, { toNextJsHandler }] = await Promise.all([import("@/lib/auth"), import("better-auth/next-js")]);
  return toNextJsHandler(auth.handler)[method](request);
}
export function GET(request: Request) { return handle(request, "GET"); }
export function POST(request: Request) { return handle(request, "POST"); }
