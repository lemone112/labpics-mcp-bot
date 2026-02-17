"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MotionGroup } from "@/components/ui/motion-group";
import { Toast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPin, setSignupPin] = useState("");
  const [signupRequestId, setSignupRequestId] = useState("");
  const [signupStatus, setSignupStatus] = useState({
    loaded: false,
    enabled: false,
    hasTelegramToken: false,
    ownerBound: false,
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  useEffect(() => {
    let active = true;
    apiFetch("/auth/signup/status")
      .then((data) => {
        if (!active) return;
        setSignupStatus({
          loaded: true,
          enabled: Boolean(data?.enabled),
          hasTelegramToken: Boolean(data?.has_telegram_token),
          ownerBound: Boolean(data?.owner_bound),
        });
      })
      .catch(() => {
        if (!active) return;
        setSignupStatus({
          loaded: true,
          enabled: false,
          hasTelegramToken: false,
          ownerBound: false,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  async function onLoginSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setToast({ type: "info", message: "" });
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: { username: loginUsername, password: loginPassword },
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

  async function onSignupStart(event) {
    event.preventDefault();
    setLoading(true);
    setToast({ type: "info", message: "" });
    try {
      const data = await apiFetch("/auth/signup/start", {
        method: "POST",
        body: {
          username: signupUsername,
          password: signupPassword,
        },
      });
      setSignupRequestId(String(data?.signup_request_id || ""));
      setToast({ type: "success", message: "PIN sent to Telegram owner. Enter it below." });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to send PIN" });
    } finally {
      setLoading(false);
    }
  }

  async function onSignupConfirm(event) {
    event.preventDefault();
    setLoading(true);
    setToast({ type: "info", message: "" });
    try {
      await apiFetch("/auth/signup/confirm", {
        method: "POST",
        body: {
          signup_request_id: signupRequestId,
          pin: signupPin,
        },
      });
      setToast({ type: "success", message: "Account created. Redirecting..." });
      router.push("/projects");
      router.refresh();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to confirm PIN" });
    } finally {
      setLoading(false);
    }
  }

  function resetSignupFlow() {
    setSignupRequestId("");
    setSignupPin("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4">
      <MotionGroup className="w-full max-w-md">
        <Card data-motion-item className="w-full">
          <CardHeader>
            <CardTitle>{mode === "login" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>Use credentials or create account with Telegram PIN verification.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "login" ? "default" : "secondary"}
                onClick={() => setMode("login")}
              >
                Sign in
              </Button>
              <Button
                type="button"
                variant={mode === "signup" ? "default" : "secondary"}
                onClick={() => {
                  setMode("signup");
                  setToast({ type: "info", message: "" });
                }}
                disabled={!signupStatus.enabled}
              >
                Create account
              </Button>
            </div>

            {mode === "login" ? (
              <form className="space-y-4" onSubmit={onLoginSubmit}>
                <div className="space-y-1">
                  <label className="text-sm text-[var(--text-muted)]">Username</label>
                  <Input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} required />
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-[var(--text-muted)]">Password</label>
                  <Input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                {!signupStatus.enabled ? (
                  <div className="app-inset border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-sm text-[var(--status-warning-fg)]">
                    {!signupStatus.loaded
                      ? "Checking signup availability..."
                      : signupStatus.hasTelegramToken
                        ? "Signup is waiting for owner bind. Send /bind to the Telegram bot first."
                        : "Signup is disabled because Telegram token is not configured."}
                  </div>
                ) : null}

                {!signupRequestId ? (
                  <form className="space-y-4" onSubmit={onSignupStart}>
                    <div className="space-y-1">
                      <label className="text-sm text-[var(--text-muted)]">New username</label>
                      <Input
                        value={signupUsername}
                        onChange={(e) => setSignupUsername(e.target.value)}
                        placeholder="lowercase, 3-32 chars"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm text-[var(--text-muted)]">New password</label>
                      <Input
                        type="password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="min 8 chars"
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading || !signupStatus.enabled}>
                      {loading ? "Sending PIN..." : "Send PIN"}
                    </Button>
                  </form>
                ) : (
                  <form className="space-y-4" onSubmit={onSignupConfirm}>
                    <div className="space-y-1">
                      <label className="text-sm text-[var(--text-muted)]">6-digit PIN</label>
                      <Input
                        value={signupPin}
                        onChange={(e) => setSignupPin(e.target.value)}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="123456"
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Creating account..." : "Create account"}
                    </Button>
                    <Button type="button" variant="secondary" className="w-full" onClick={resetSignupFlow} disabled={loading}>
                      Request new PIN
                    </Button>
                  </form>
                )}
              </div>
            )}

            <Toast className="mt-4" type={toast.type} message={toast.message} />
          </CardContent>
        </Card>
      </MotionGroup>
    </div>
  );
}
