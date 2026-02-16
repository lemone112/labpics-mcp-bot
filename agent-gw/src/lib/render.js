// @ts-nocheck

import { shortId, snippetText } from "./util.js";

export function renderCommitmentsCard(projectName, projectId, items, upserted) {
  const bySide = { client: 0, us: 0, unknown: 0 };
  for (const it of items) bySide[it.side] = (bySide[it.side] || 0) + 1;

  const header =
    `🤝 Договоренности\n\n` +
    `Проект: ${projectName}\n` +
    `ID: ${shortId(projectId)}\n\n` +
    `Сводка: client ${bySide.client} • us ${bySide.us} • unknown ${bySide.unknown}\n` +
    `Обновлено: +${upserted.ok}/${upserted.attempted}\n\n`;

  const lines = items.slice(0, 10).map((it, i) => {
    const side = it.side === "client" ? "[Клиент]" : it.side === "us" ? "[Мы]" : "[?]";
    const due = it.due_at ? ` • due ${it.due_at}` : "";
    const who = it.who ? ` (${it.who})` : "";
    return `${i + 1}) ${side}${who} ${it.what}${due}`;
  });

  return header + (lines.length ? lines.join("\n") : "Пока нет явных договоренностей.");
}

export function renderSearchResults(projectName, query, matches) {
  const header = `🔎 Search\n\nПроект: ${projectName}\nЗапрос: ${query || "—"}\n\n`;
  if (!matches.length) return header + "Ничего не найдено.";
  const lines = matches.map((m, i) => `${i + 1}) ${snippetText(m.text, 220)} (conv ${shortId(m.conversation_global_id)})`);
  return header + lines.join("\n\n");
}
