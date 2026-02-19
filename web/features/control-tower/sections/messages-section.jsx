"use client";

import { memo, useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EMPTY_WIZARD, PRIMARY_CTA } from "../lib/formatters";

function LinkifiedText({ text }) {
  const source = String(text || "");
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = source.split(urlRegex);

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((part, idx) => {
        if (/^https?:\/\/\S+$/.test(part)) {
          return (
            <a key={`link-${idx}`} href={part} target="_blank" rel="noreferrer" className="text-primary underline">
              {part}
            </a>
          );
        }
        return <span key={`text-${idx}`}>{part}</span>;
      })}
    </p>
  );
}

export const MessagesSection = memo(function MessagesSection({ messagesPayload, selectedPersonId, setSelectedPersonId, loadingMessages }) {
  const project = messagesPayload?.project || null;
  const persons = Array.isArray(messagesPayload?.persons) ? messagesPayload.persons : [];
  const messages = Array.isArray(messagesPayload?.messages) ? messagesPayload.messages : [];
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [project?.id, selectedPersonId, messages.length]);

  const personName = persons.find((item) => item.contact_global_id === selectedPersonId)?.person_name || "Не выбран";

  return (
    <Card data-motion-item className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Переписки</CardTitle>
          <Badge variant="outline">{project?.name || "-"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-xs">
            <Select
              value={selectedPersonId || persons[0]?.contact_global_id || "none"}
              onValueChange={(value) => setSelectedPersonId(value === "none" ? "" : value)}
            >
              <SelectTrigger aria-label="Выбрать персону клиента">
                <SelectValue placeholder="Выбрать персону" />
              </SelectTrigger>
              <SelectContent>
                {!persons.length ? <SelectItem value="none">Персоны не найдены</SelectItem> : null}
                {persons.map((person) => (
                  <SelectItem key={person.contact_global_id} value={person.contact_global_id}>
                    {person.person_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-muted-foreground">Текущая персона: {personName}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[70svh] overflow-y-auto px-4 py-3">
          <div className="sticky top-0 z-10 mb-3 rounded-md border bg-background/95 px-3 py-2 text-xs backdrop-blur">
            <span className="font-medium">{project?.name || "-"}</span>
            <span className="mx-2 text-muted-foreground">•</span>
            <span className="text-muted-foreground">{personName}</span>
          </div>

          <div className="space-y-3">
            {loadingMessages ? <p className="text-sm text-muted-foreground">Загрузка переписки...</p> : null}
            {!loadingMessages &&
              messages.map((message) => {
                const incoming = message.sender_type === "contact" || message.sender_type === "client";
                return (
                  <div key={message.id} className={cn("flex", incoming ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl border px-3 py-2",
                        incoming ? "rounded-bl-sm bg-muted" : "rounded-br-sm bg-primary text-primary-foreground"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] opacity-80">
                        <span>{message.author_name || (incoming ? "Клиент" : "Команда")}</span>
                        <span>•</span>
                        <span>{message.channel || "-"}</span>
                      </div>
                      <LinkifiedText text={message.content} />
                      {Array.isArray(message.attachments) && message.attachments.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {message.attachments.map((file) => (
                            <Badge key={file.id} variant="outline" className="text-[11px]">
                              attachment: {file.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 text-right text-[11px] opacity-80">
                        {message.created_at ? new Date(message.created_at).toLocaleString("ru-RU") : "-"}
                      </div>
                    </div>
                  </div>
                );
              })}
            {!loadingMessages && !messages.length ? (
              <EmptyState
                title="Переписки"
                reason={EMPTY_WIZARD.messages.reason}
                steps={EMPTY_WIZARD.messages.steps}
                primaryAction={<Button>{PRIMARY_CTA.messages}</Button>}
              />
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
