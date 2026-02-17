const PROJECT_DOT_CLASSES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-primary",
  "bg-secondary-foreground",
  "bg-destructive",
];

function hashString(value) {
  let hash = 0;
  const source = String(value || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function projectDotClass(projectId) {
  const idx = hashString(projectId) % PROJECT_DOT_CLASSES.length;
  return PROJECT_DOT_CLASSES[idx];
}
