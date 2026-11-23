import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import "@/auth/clerk.css";
import { CLERK_APPEARANCE } from "@/auth/appearance";
import { ThemeScript } from "@/components/ThemeScript";
import { DevBar } from "@/dev/DevBar";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Ask about TikTok creators and get answers with the videos that prove them.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Sign-in and sign-up are this app's own pages; after either, Clerk returns to the redirect_url the page that sent the visitor put on the link.
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      appearance={CLERK_APPEARANCE}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          <ThemeScript />
        </head>
        <body>
          <Suspense fallback={null}>
            <DevBar />
          </Suspense>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
