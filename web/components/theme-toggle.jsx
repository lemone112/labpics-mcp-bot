"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <Select defaultValue="system" onValueChange={(v) => setTheme(v)}>
      <SelectTrigger className="w-32">
        <SelectValue placeholder="Тема" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="light">Светлая</SelectItem>
        <SelectItem value="dark">Тёмная</SelectItem>
        <SelectItem value="system">Системная</SelectItem>
      </SelectContent>
    </Select>
  );
}
