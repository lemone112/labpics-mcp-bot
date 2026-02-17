"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getCurrentSession } from "@/lib/api";
import type { SessionInfo } from "@/lib/types";

interface AuthGuardState {
  loading: boolean;
  session: SessionInfo | null;
}

export function useAuthGuard(): AuthGuardState {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await getCurrentSession();
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
