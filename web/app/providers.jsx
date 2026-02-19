"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { ProjectPortfolioProvider } from "@/hooks/use-project-portfolio";
import { OfflineBanner } from "@/components/offline-banner";
import { ToastProvider } from "@/components/ui/toast";
import { makeQueryClient } from "@/lib/query-client";

export function Providers({ children }) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <OfflineBanner />
        <ToastProvider>
          <ProjectPortfolioProvider>{children}</ProjectPortfolioProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
