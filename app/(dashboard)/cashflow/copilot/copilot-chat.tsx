"use client";

import * as React from "react";
import { Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProposalCard, type Proposal } from "./proposal-card";

/**
 * CF-5/6 — Client-side chat shell for the CFO Copilot.
 *
 * v1 (CF-5) was in-memory only. v2 (CF-6 — this version) adds
 * server-side persistence via AiConversation / AiMessage:
 *
 *   • Sidebar lists past conversations (most recent first).
 *   • Click any past conversation to load its messages.
 *   • "New" button starts a fresh conversation.
 *   • Each turn writes to the DB before/after the LLM call so
 *     reload restores state.
 *
 * Streams tokens from `/api/cashflow/copilot` and renders them as
 * they arrive. The server returns the conversation id in an
 * `x-conversation-id` response header so we can pin subsequent
 * requests in the same thread.
 */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  messageCount: number;
  lastActiveAt: string;
  createdAt: string;
};

const SUGGESTED_QUESTIONS = [
  "What's my cash position look like?",
  "Who owes me the most right now?",
  "What if my biggest customer delays by 30 days?",
  "Which week is the worst for cashflow?",
  "What recurring expenses do I have?",
  "Are there any overdue invoices to chase?",
];

export function CopilotChat({
  organizationName,
  currency,
}: {
  organizationName: string;
  currency: string;
}) {
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Mutating Tools v1 — proposals pending the user's approval in
  // the active conversation. Loaded on conversation switch + after
  // every send (Copilot may have proposed something).
  const [pendingProposals, setPendingProposals] = React.useState<Proposal[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const refreshProposals = React.useCallback(async (convId: string | null) => {
    if (!convId) {
      setPendingProposals([]);
      return;
    }
    try {
      const r = await fetch(
        `/api/cashflow/copilot/proposals/pending?conversationId=${encodeURIComponent(convId)}`
      );
      if (!r.ok) return;
      const data = (await r.json()) as { proposals: Proposal[] };
      setPendingProposals(data.proposals);
    } catch {
      // Silent — proposal panel is best-effort
    }
  }, []);

  // Whenever the active conversation changes, reload proposals.
  React.useEffect(() => {
    refreshProposals(activeId);
  }, [activeId, refreshProposals]);

  // Load the conversation list once on mount + after any send/delete.
  const refreshConversations = React.useCallback(async () => {
    try {
      const r = await fetch("/api/cashflow/copilot/conversations");
      if (!r.ok) return;
      const data = (await r.json()) as { conversations: ConversationSummary[] };
      setConversations(data.conversations);
    } catch {
      // Silent — sidebar refresh isn't critical to the chat itself.
    }
  }, []);

  React.useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function loadConversation(id: string) {
    if (busy || loadingHistory) return;
    setLoadingHistory(true);
    setError(null);
    try {
      const r = await fetch(`/api/cashflow/copilot/conversations/${id}`);
      if (!r.ok) throw new Error("Could not load conversation");
      const data = (await r.json()) as {
        conversation: {
          id: string;
          messages: { id: string; role: string; content: string }[];
        };
      };
      setActiveId(data.conversation.id);
      setMessages(
        data.conversation.messages.map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Delete this conversation? This can't be undone.")) {
      return;
    }
    try {
      const r = await fetch(`/api/cashflow/copilot/conversations/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Delete failed");
      if (activeId === id) startNew();
      await refreshConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  function startNew() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
  }

  async function send(text: string) {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);

    const assistantId = `a-${Date.now()}`;
    setMessages((cur) => [
      ...cur,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const resp = await fetch("/api/cashflow/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          conversationId: activeId ?? undefined,
        }),
      });
      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => "");
        throw new Error(errText || `Request failed (${resp.status})`);
      }
      // Pin the conversation id so subsequent sends attach to the
      // same thread. The server echoes the id whether it created a
      // new conversation or used the one we sent.
      const returnedId = resp.headers.get("x-conversation-id");
      if (returnedId) setActiveId(returnedId);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setMessages((cur) => cur.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false);
      // Refresh sidebar so the new / updated conversation appears
      // (and bubbles to the top thanks to lastActiveAt ordering).
      refreshConversations();
      // Mutating Tools v1 — Claude may have proposed an action this
      // turn; pull pending proposals so the approval card shows up.
      refreshProposals(activeId);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    send(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const text = input.trim();
      if (text && !busy) send(text);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* ── Sidebar — past conversations ──────────────────────────── */}
      <aside className="space-y-3">
        <Button
          type="button"
          variant="outline"
          onClick={startNew}
          className="w-full justify-start"
        >
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          New conversation
        </Button>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div
              className="overflow-y-auto"
              style={{ maxHeight: "min(60vh, 540px)" }}
            >
              {conversations.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground italic">
                  No past conversations yet. Your chat history will
                  appear here.
                </div>
              ) : (
                <ul className="divide-y">
                  {conversations.map((c) => {
                    const isActive = c.id === activeId;
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "group flex items-start gap-1 px-2 py-2 hover:bg-muted/40 cursor-pointer",
                          isActive && "bg-muted/60"
                        )}
                        onClick={() => loadConversation(c.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {c.title}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {c.messageCount} msgs ·{" "}
                            {formatDistanceToNow(new Date(c.lastActiveAt), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-100 hover:text-rose-600 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(c.id);
                          }}
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* ── Chat ───────────────────────────────────────────────── */}
      <div className="space-y-3 min-w-0">
        {!hasMessages && (
          <Card>
            <CardContent className="pt-5">
              <div className="text-sm text-muted-foreground mb-2">
                Try one of these to get started:
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={busy}
                    className="text-xs rounded-full border bg-background px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-3 leading-relaxed">
                The copilot can read your live data via tools:{" "}
                <span className="font-mono">cashflow_summary</span>,{" "}
                <span className="font-mono">weekly_breakdown</span>,{" "}
                <span className="font-mono">overdue_invoices</span>,{" "}
                <span className="font-mono">upcoming_bills</span>,{" "}
                <span className="font-mono">top_customers_by_ar</span>,{" "}
                <span className="font-mono">recurring_profiles</span>.{" "}
                It can&apos;t mutate anything — read-only by design.
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div
              ref={scrollRef}
              className="overflow-y-auto px-4 py-3 space-y-3"
              style={{ maxHeight: "min(60vh, 540px)" }}
            >
              {loadingHistory ? (
                <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading conversation…
                </div>
              ) : !hasMessages ? (
                <div className="py-12 text-center text-sm text-muted-foreground italic">
                  Ask anything about {organizationName}&apos;s cashflow,
                  receivables, payables, or recurring profiles.
                </div>
              ) : (
                messages.map((m) => (
                  <MessageBubble key={m.id} message={m} busy={busy} />
                ))
              )}
              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
              {/* Mutating Tools v1 — render any pending approval
                  cards inline below the message stream. */}
              {pendingProposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  onResolved={() => refreshProposals(activeId)}
                />
              ))}
            </div>
            <form
              onSubmit={onSubmit}
              className="border-t bg-muted/30 p-3 flex items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Ask about ${currency} cashflow, AR, AP, or recurring profiles…`}
                rows={2}
                className="flex-1 resize-none bg-background"
                disabled={busy || loadingHistory}
              />
              <Button
                type="submit"
                disabled={!input.trim() || busy || loadingHistory}
                size="icon"
                aria-label="Send"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Powered by Claude Sonnet 4.5 with read-only Quikfinance tools.
          Ctrl/Cmd-Enter to send. Conversations are saved per user.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  busy,
}: {
  message: ChatMessage;
  busy: boolean;
}) {
  const isUser = message.role === "user";
  const isStreaming =
    busy && !isUser && message.content.length === 0;
  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isStreaming ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </span>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}
