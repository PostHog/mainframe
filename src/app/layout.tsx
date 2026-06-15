import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POSTHOG MAINFRAME",
  description: "PostHog Mainframe — IBM 3270 terminal emulator",
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
