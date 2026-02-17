"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MotionGroup } from "@/components/ui/motion-group";
import { Toast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setToast({ type: "info", message: "" });
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToast({ type: "success", message: "Login successful. Redirecting..." });
      router.push("/projects");
      router.refresh();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Login failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 lg:p-8">
      <MotionGroup className="grid w-full max-w-5xl gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section data-motion-item className="app-surface hidden rounded-[var(--radius-lg)] p-7 lg:flex lg:flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-500)]">
            LABPICS PLATFORM
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text-strong)]">
            Operational CRM intelligence with Attio-inspired clarity
          </h1>
          <p className="mt-3 max-w-md text-sm text-[var(--text-muted)]">
            Clean command center for sync, embeddings and semantic search, designed around
            fast scanning and confident actions.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-[var(--text-primary)]">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--brand-400)]" />
              Session auth with project-level context.
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--brand-400)]" />
              Real-time job observability and storage footprint.
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--brand-400)]" />
              High-signal semantic retrieval for support threads.
            </li>
          </ul>
        </section>

        <Card data-motion-item className="w-full">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use API credentials from server env.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.09em] text-[var(--text-muted)]">
                  Username
                </label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.09em] text-[var(--text-muted)]">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <Toast className="mt-4" type={toast.type} message={toast.message} />
          </CardContent>
        </Card>
      </MotionGroup>
    </div>
  );
}
