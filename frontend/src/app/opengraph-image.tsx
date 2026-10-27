import { createSocialImageResponse } from "@/lib/social-image";

// The frontend's private service binding requires the Node.js runtime on Vercel.
export const runtime = "nodejs";

export const alt = "DGCLIPS — Seu estúdio criativo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return createSocialImageResponse();
}
