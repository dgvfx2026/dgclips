import { createSocialImageResponse } from "@/lib/social-image";

// Keep both social-image routes compatible with Vercel service bindings.
export const runtime = "nodejs";

export const alt = "DGCLIPS — Seu estúdio criativo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return createSocialImageResponse();
}
