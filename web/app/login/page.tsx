"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { login } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import type { ToastType } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({
    type: "info",
    message: "",
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      await login({ username, password });
      setToast({ type: "success", message: "Login successful. Redirecting..." });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_42%)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Labpics</p>
          <CardTitle>Sign in to Ops Console</CardTitle>
          <CardDescription>Use credentials configured in server environment variables.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.12em] text-slate-400">Username</label>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-[0.12em] text-slate-400">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <Toast type={toast.type} message={toast.message} />
        </CardContent>
      </Card>
    </div>
  );
}
