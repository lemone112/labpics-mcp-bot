import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata = {
  title: "Labpics MVP",
  description: "Operations console for Chatwoot ingestion and vector search",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="light" data-theme="light" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
