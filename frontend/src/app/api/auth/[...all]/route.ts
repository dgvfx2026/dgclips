import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { workspaceConfigured } from "@/lib/dgclips";
import { NextResponse } from "next/server";

const handlers = toNextJsHandler(auth.handler);
export async function GET(request: Request) {
  if (!workspaceConfigured()) return NextResponse.json({ error: "Configure o servidor para ativar a autenticação." }, { status: 503 });
  return handlers.GET(request);
}
export async function POST(request: Request) {
  if (!workspaceConfigured()) return NextResponse.json({ error: "Configure o servidor para ativar a autenticação." }, { status: 503 });
  return handlers.POST(request);
}
