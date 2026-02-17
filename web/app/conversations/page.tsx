"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { getConversations, getMessages } from "@/lib/api";
import type { Conversation, MessageSnippet, ToastType } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";

function buildConversationGlobalId(conversation: Conversation | null) {
  if (!conversation || !conversation.account_id) return "";
  return `cw:${conversation.account_id}:${conversation.conversation_id}`;
}

export default function ConversationsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSnippet[]>([]);
  const [busy, setBusy] = useState(false);
  const [messagesBusy, setMessagesBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({
    type: "info",
    message: "",
  });

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  async function loadConversations() {
    if (!activeProject?.id) {
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }

    setBusy(true);
    try {
      const data = await getConversations(60);
      setConversations(data.conversations || []);
      if (!selectedConversationId && data.conversations?.length) {
        setSelectedConversationId(data.conversations[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load conversations";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  async function loadMessages(conversation: Conversation | null) {
    if (!conversation || !activeProject?.id) return;
    setMessagesBusy(true);
    try {
      const globalId = buildConversationGlobalId(conversation);
      if (!globalId) {
        setMessages([]);
        return;
      }
      const data = await getMessages(80, globalId);
      setMessages(data.messages || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load messages";
      setToast({ type: "error", message });
    } finally {
      setMessagesBusy(false);
    }
  }

  useEffect(() => {
    if (!authLoading && session?.authenticated && activeProject?.id) {
      void loadConversations();
      return;
    }

    setConversations([]);
    setSelectedConversationId(null);
    setMessages([]);
  }, [authLoading, session?.authenticated, activeProject?.id]);

  useEffect(() => {
    if (selectedConversation) {
      void loadMessages(selectedConversation);
    }
  }, [selectedConversation?.id]);

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Conversations"
      subtitle="Reader for source conversations with details panel and evidence-first context."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={
        <>
          <Badge variant="warning">PII-safe: snippets only in list view</Badge>
          <Button variant="outline" onClick={() => void loadConversations()} disabled={busy || !activeProject?.id}>
            {busy ? "Refreshing..." : "Refresh"}
          </Button>
        </>
      }
    >
      {!activeProject ? (
        <EmptyState
          title="Select active project"
          description="Conversation reader is project-scoped and requires active selection."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Conversation list</CardTitle>
            <CardDescription>Select row to inspect message snippets and source IDs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inbox</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((conversation) => (
                  <TableRow
                    key={conversation.id}
                    className={selectedConversationId === conversation.id ? "bg-slate-900/70" : undefined}
                  >
                    <TableCell>
                      <button
                        className="font-mono text-xs text-cyan-200 underline-offset-4 hover:underline"
                        onClick={() => setSelectedConversationId(conversation.id)}
                      >
                        {conversation.conversation_id}
                      </button>
                    </TableCell>
                    <TableCell>{conversation.status || "-"}</TableCell>
                    <TableCell>{conversation.inbox_id ?? "-"}</TableCell>
                    <TableCell>{formatDateTime(conversation.updated_at || conversation.created_at)}</TableCell>
                  </TableRow>
                ))}
                {!conversations.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-400">
                      No conversations found. Run sync job first.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details panel</CardTitle>
            <CardDescription>
              {selectedConversation
                ? `Conversation ${selectedConversation.conversation_id} · ${buildConversationGlobalId(selectedConversation)}`
                : "Select conversation from list"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {messagesBusy ? <p className="text-sm text-slate-400">Loading messages...</p> : null}
            {messages.map((message) => (
              <article key={message.id} className="rounded-md border border-slate-800 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-500">{message.id}</span>
                  <Badge variant={message.private ? "warning" : "default"}>
                    {message.private ? "private" : message.sender_type || "message"}
                  </Badge>
                </div>
                <p className="text-sm text-slate-200">{message.content_snippet || "-"}</p>
                <p className="mt-2 text-[11px] text-slate-500">{formatDateTime(message.created_at || message.updated_at)}</p>
              </article>
            ))}
            {!messages.length && !messagesBusy ? (
              <p className="text-sm text-slate-400">No messages for selected conversation.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <Toast type={toast.type} message={toast.message} />
      </div>
      )}
    </PageShell>
  );
}
