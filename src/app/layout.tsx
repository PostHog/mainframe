import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostHog Mainframe",
  description: "Your PostHog data on a vintage IBM 3270 terminal. Browse insights, feature flags, and experiments in retro green phosphor.",
  openGraph: {
    title: "PostHog Mainframe",
    description: "Your PostHog data on a vintage IBM 3270 terminal. Browse insights, feature flags, and experiments in retro green phosphor.",
    url: "https://posthog-mainframe.vercel.app",
    siteName: "PostHog Mainframe",
    images: [{ url: "https://posthog-mainframe.vercel.app/screenshot.png" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PostHog Mainframe",
    description: "Your PostHog data on a vintage IBM 3270 terminal. Browse insights, feature flags, and experiments in retro green phosphor.",
    images: ["https://posthog-mainframe.vercel.app/screenshot.png"],
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
