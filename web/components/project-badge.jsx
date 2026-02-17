"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { projectDotClass } from "@/lib/project-colors";

export function ProjectBadge({ projectId, projectName, className }) {
  return (
    <Badge variant="outline" className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("h-2 w-2 rounded-full", projectDotClass(projectId))} />
      <span>{projectName}</span>
    </Badge>
  );
}
