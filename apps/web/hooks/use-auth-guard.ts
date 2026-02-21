"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getCurrentSession } from "@/lib/api";

type AuthSession = {
  authenticated?: boolean;
  [key: string]: unknown;
};

export function useAuthGuard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = (await getCurrentSession()) as AuthSession | null;
        if (!mounted) return;
        if (!data?.authenticated) {
          router.replace("/login");
          return;
        }
        setSession(data);
      } catch {
        if (mounted) router.replace("/login");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  return { loading, session };
}
