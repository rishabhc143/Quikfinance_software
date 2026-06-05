"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * CF-5 — Client-side chat shell for the CFO Copilot.
 *
 * Streams tokens from `/api/cashflow/copilot` and renders them as
 * they arrive. Conversation state is purely in-memory for v1 — the
 * tab is the durability boundary. v2 will hook this into
 * AiConversation/AiMessage so sessions persist across reloads.
 *
 * Auto-grows the input textarea up to 6 lines, ctrl/cmd-Enter
 * submits, plain Enter inserts a newline (helps when the user
 * pastes a multi-line question).
 */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Keep the bottom of the chat in view as new tokens arrive.
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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

    // Insert a placeholder assistant message we'll stream into.
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
        }),
      });
      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => "");
        throw new Error(
          errText || `Request failed with status ${resp.status}`
        );
      }
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
      // Drop the empty assistant placeholder on error
      setMessages((cur) => cur.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false);
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

  return (
    <div className="space-y-3">
      {/* Suggestion chips — only shown before the first message. */}
      {messages.length === 0 && (
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
                  className="text-xs rounded-full border bg-background px-3 py-1.5 hover:bg-muted transition-colors"
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

      {/* Conversation */}
      <Card>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="overflow-y-auto px-4 py-3 space-y-3"
            style={{ maxHeight: "min(60vh, 600px)" }}
          >
            {messages.length === 0 ? (
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
              disabled={busy}
            />
            <Button
              type="submit"
              disabled={!input.trim() || busy}
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
        Ctrl/Cmd-Enter to send. Conversation is not yet persisted
        across reloads in this version.
      </p>
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
