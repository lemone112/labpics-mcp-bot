import "./globals.css";

export const metadata = {
  title: "Labpics MVP",
  description: "Operations console for Chatwoot ingestion and vector search",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
