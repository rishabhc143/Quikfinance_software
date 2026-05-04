"use client";

import * as React from "react";
import { Bot, Send, Loader2, History, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; messageCount: number; createdAt: string };

const WELCOME: Msg = { role: "assistant", content: "Hi! I'm Quikfinance's AI assistant. Ask me about invoicing, GST, expenses, or how to use any feature." };

export function AiAssistant({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([WELCOME]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadHistory() {
    try {
      const r = await fetch("/api/ai/conversations");
      if (r.ok) setConversations(await r.json());
    } catch { /* ignore */ }
  }

  async function loadConversation(id: string) {
    setHistoryOpen(false);
    try {
      const r = await fetch(`/api/ai/conversations/${id}`);
      if (r.ok) {
        const data: { messages: Msg[] } = await r.json();
        setMessages(data.messages.length ? data.messages : [WELCOME]);
      }
    } catch { /* ignore */ }
  }

  function newConversation() {
    setHistoryOpen(false);
    setMessages([WELCOME]);
    setInput("");
  }

  async function send() {
    if (!input.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!r.ok || !r.body) throw new Error(await r.text());
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMessages((m) => [...m, { role: "assistant", content: `Sorry, I hit an error: ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children ? (
        <button onClick={() => setOpen(true)} className="contents">{children}</button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 h-14 px-5 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-2 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bot className="h-5 w-5" />
          Need Assistance?
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 h-[600px] flex flex-col">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Quikfinance Assistant</DialogTitle>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" aria-label="New conversation" onClick={newConversation}><Plus className="h-4 w-4" /></Button>
                <Popover open={historyOpen} onOpenChange={(v) => { setHistoryOpen(v); if (v) loadHistory(); }}>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="Show history"><History className="h-4 w-4" /></Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-0">
                    <div className="px-3 py-2 border-b text-xs font-medium uppercase tracking-wider text-muted-foreground">Past conversations</div>
                    <div className="max-h-80 overflow-y-auto">
                      {conversations.length === 0 ? (
                        <div className="p-4 text-xs text-center text-muted-foreground">No past conversations.</div>
                      ) : (
                        <ul className="divide-y">
                          {conversations.map((c) => (
                            <li key={c.id}>
                              <button onClick={() => loadConversation(c.id)} className="w-full text-left p-2 hover:bg-accent">
                                <div className="text-sm truncate">{c.title}</div>
                                <div className="text-[10px] text-muted-foreground">{c.messageCount} msgs · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={
                  m.role === "user"
                    ? "max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm"
                    : "max-w-[85%] bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap"
                }>{m.content}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form
            className="flex items-center gap-2 p-3 border-t"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="flex-1 h-10 px-3 text-sm rounded-md border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !input.trim()} size="icon">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
