"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Use API credentials from server env.</CardDescription>
        </CardHeader>
        <CardContent>
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

          <Toast className="mt-4" type={toast.type} message={toast.message} />
        </CardContent>
      </Card>
    </div>
  );
}
