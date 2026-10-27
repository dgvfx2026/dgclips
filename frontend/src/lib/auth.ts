import { betterAuth } from "better-auth";
import { randomBytes } from "node:crypto";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";
import { nextCookies } from "better-auth/next-js";
import { getAuthTrustedOrigins } from "@/lib/auth-origins";
import { prepareAccountDeletion } from "@/server/account-deletion";
import { fetchBackend } from "@/server/backend-api";

const disableSignUp = ["1", "true", "yes"].includes(
  (process.env.DISABLE_SIGN_UP ?? "").toLowerCase()
);

async function sendPasswordResetEmail(userId: string, url: string) {
  const response = await fetchBackend("/account/password-reset-email", {
    method: "POST",
    userId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Backend password reset email failed with ${response.status}: ${detail || "unknown error"}`
    );
  }
}

const trustedOrigins = getAuthTrustedOrigins({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
  NEXT_PUBLIC_SELF_HOST: process.env.NEXT_PUBLIC_SELF_HOST,
});

export const auth = betterAuth({
  // Demo builds have no accounts or authentication endpoints. An ephemeral
  // secret allows route compilation without embedding a production credential.
  secret: process.env.BETTER_AUTH_SECRET ||
    ((!process.env.DATABASE_URL || process.env.DGCLIPS_DEMO === "true") ? randomBytes(32).toString("hex") : undefined),
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3107"),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await prepareAccountDeletion(user.id);
      },
    },
    additionalFields: {
      is_admin: {
        type: "boolean",
        input: false,
      },
    },
  },
  trustedOrigins,
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      const response = await fetchBackend("/account/verification-email", {
        method: "POST",
        userId: user.id,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        cache: "no-store",
      });
      if (!response.ok) {
        // Do not log the verification URL or token.
        throw new Error(`Verification email delivery failed (${response.status})`);
      }
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited so response timing doesn't reveal whether an account exists.
      void sendPasswordResetEmail(user.id, url).catch((error) => {
        console.error("Failed to send password reset email", error);
      });
    },
  },
  plugins: [
    nextCookies(), // Enable Next.js cookie handling
  ],
});

export type Session = typeof auth.$Infer.Session;
