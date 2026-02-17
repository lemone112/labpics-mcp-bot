import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata = {
  title: "Labpics MVP",
  description: "Operations console for Chatwoot ingestion and vector search",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
