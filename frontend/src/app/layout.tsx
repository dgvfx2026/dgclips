import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AttributionTracker } from "@/components/attribution-tracker";
import { DataFastIdentity } from "@/components/datafast-identity";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FeedbackButton } from "@/components/feedback-button";
import { PostHogIdentity } from "@/components/posthog-identity";
import { intlLocale } from "@/i18n/config";
import { getSiteUrl } from "@/lib/site";
import { workspaceConfigured } from "@/lib/dgclips";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dataFastWebsiteId = process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID;
const dataFastDomain = process.env.NEXT_PUBLIC_DATAFAST_DOMAIN;
const shouldTrackLocalhost = process.env.NEXT_PUBLIC_DATAFAST_ALLOW_LOCALHOST === "true";
const isDataFastEnabled = Boolean(dataFastWebsiteId && dataFastDomain);
// Tilly analytics runs next to DataFast; it only uses its own cookies and window.tilly.
const tillyWebsiteId = process.env.NEXT_PUBLIC_TILLY_WEBSITE_ID;

export async function generateMetadata(): Promise<Metadata> { return { title: { default: "DGCLIPS — Seu estúdio criativo", template: "%s | DGCLIPS" }, description: "Transforme vídeos longos em clipes com inteligência artificial. Seu conteúdo, sua identidade.", applicationName: "DGCLIPS", metadataBase: new URL(getSiteUrl()), icons: { icon: "/dgclips.svg" }, robots: { index: false, follow: false }, openGraph: { title: "DGCLIPS — Seu estúdio criativo", siteName: "DGCLIPS", type: "website" }, twitter: { card: "summary_large_image", title: "DGCLIPS — Seu estúdio criativo" } }; }

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={intlLocale(locale)} className="dark">
      <head>
        {isDataFastEnabled ? (
          <>
            <Script id="datafast-queue" strategy="beforeInteractive">
              {`window.datafast = window.datafast || function() {
  window.datafast.q = window.datafast.q || [];
  window.datafast.q.push(arguments);
};`}
            </Script>
            <Script
              id="datafast-script"
              strategy="afterInteractive"
              src="/js/script.js"
              data-website-id={dataFastWebsiteId}
              data-domain={dataFastDomain}
              data-allow-localhost={shouldTrackLocalhost ? "true" : undefined}
              data-disable-console="true"
            />
          </>
        ) : null}
        {tillyWebsiteId ? (
          <>
            <Script id="tilly-queue" strategy="beforeInteractive">
              {`window.tilly = window.tilly || function() {
  window.tilly.q = window.tilly.q || [];
  window.tilly.q.push(arguments);
};`}
            </Script>
            <Script
              id="tilly-script"
              strategy="afterInteractive"
              src="https://tilly.samihindi.com/js/script.js"
              data-website-id={tillyWebsiteId}
              data-allow-localhost={shouldTrackLocalhost ? "true" : undefined}
            />
          </>
        ) : null}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider>
            {children}
            {workspaceConfigured() && <><DataFastIdentity /><PostHogIdentity /><AttributionTracker /><FeedbackButton /></>}
            <Toaster />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
