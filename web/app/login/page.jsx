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
      setToast({ type: "success", message: "Вход выполнен. Перенаправление..." });
      router.push("/control-tower/dashboard");
      router.refresh();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка входа" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <MotionGroup className="w-full max-w-sm">
        <Card data-motion-item className="w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>
            </div>
            <CardTitle className="text-base">Вход в систему</CardTitle>
            <CardDescription>Введите учётные данные для авторизации.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Логин</label>
                <Input
                  data-testid="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Пароль</label>
                <Input
                  data-testid="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button data-testid="login-submit" type="submit" className="w-full" disabled={loading}>
                {loading ? "Вход..." : "Войти"}
              </Button>
            </form>

            <Toast className="mt-4" type={toast.type} message={toast.message} />
          </CardContent>
        </Card>
      </MotionGroup>
    </div>
  );
}
