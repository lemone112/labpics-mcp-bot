"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { ProjectPortfolioProvider } from "@/hooks/use-project-portfolio";

export function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ProjectPortfolioProvider>{children}</ProjectPortfolioProvider>
    </ThemeProvider>
  );
}
