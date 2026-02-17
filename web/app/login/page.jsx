"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { API_BASE, apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [providers, setProviders] = useState({ password: true, google: false });

  useEffect(() => {
    let alive = true;
    apiFetch("/auth/providers")
      .then((data) => {
        if (!alive) return;
        const nextProviders = data?.providers || {};
        setProviders({
          password: Boolean(nextProviders.password),
          google: Boolean(nextProviders.google),
        });
      })
      .catch(() => {
        if (!alive) return;
        setProviders({ password: true, google: false });
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const error = String(searchParams?.get("error") || "").trim();
    if (!error) return;

    const messages = {
      google_auth_disabled: "Google sign-in is not enabled.",
      google_state_invalid: "Google sign-in failed. Please try again.",
      google_auth_failed: "Google sign-in failed. Please try again.",
    };
    setToast({
      type: "error",
      message: messages[error] || "Login failed",
    });
  }, [searchParams]);

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

  function onGoogleSignIn() {
    window.location.href = `${API_BASE}/auth/google/start?next=${encodeURIComponent("/projects")}`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Use local credentials or continue with Google.</CardDescription>
        </CardHeader>
        <CardContent>
          {providers.password ? (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-slate-400">Username</label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : (
            <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
              Username/password login is disabled.
            </div>
          )}

          {providers.google ? (
            <>
              <div className="my-4 border-t border-slate-800" />
              <Button type="button" variant="secondary" className="w-full" onClick={onGoogleSignIn}>
                Continue with Google
              </Button>
            </>
          ) : null}

          <Toast className="mt-4" type={toast.type} message={toast.message} />
        </CardContent>
      </Card>
    </div>
  );
}
