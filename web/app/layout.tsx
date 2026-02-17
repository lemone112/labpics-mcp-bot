import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Labpics Ops Console",
    template: "%s · Labpics Ops Console",
  },
  description: "Operations console for project-scoped memory, jobs, and evidence-first decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
