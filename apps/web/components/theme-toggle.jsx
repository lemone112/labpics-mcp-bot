"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="h-8 w-[7.5rem] gap-1.5 text-xs" aria-label="Переключить тему">
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
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
