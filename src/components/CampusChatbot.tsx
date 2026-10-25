import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MAX_MESSAGE_CHARS = 600;

interface ChatBubble {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

const SUGGESTED_QUESTIONS = [
  'How does FlatMate compatibility scoring work?',
  'How do I donate or swap a book on BookBridge?',
  'How can I get the College Verified badge?',
  'Are there any published flats or free books right now?',
] as const;

const WELCOME_MESSAGE: ChatBubble = {
  id: 'welcome',
  role: 'model',
  text: "Hi! I'm the CampusCircle Assistant. Ask me anything about finding zero-brokerage flats, flatmate compatibility matching, BookBridge free textbook sharing, or verifying your College ID.",
  timestamp: 'Ready',
};

const ROUTE_TOKEN_REGEX =
  /(\/(?:flats(?:\/new|\/[0-9a-fA-F-]{8,})?|flatmates|books(?:\/new|\/[0-9a-fA-F-]{8,})?|profile(?:\?tab=(?:academic|preferences|verification|privacy))?|dashboard|activity|messages|auth(?:\?mode=signup)?))/g;

function renderFormattedInline(
  line: string,
  onNavigateRoute: (route: string) => void
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Remove backticks wrapping valid CampusCircle routes so they render as clean clickable chips
  const normalized = line.replace(
    /`(\/(?:flats|flatmates|books|profile|dashboard|activity|messages|auth)[^`\s]*)`/g,
    '$1'
  );

  const segments = normalized.split(ROUTE_TOKEN_REGEX);
  segments.forEach((seg, idx) => {
    if (!seg) return;
    if (seg.startsWith('/') && ROUTE_TOKEN_REGEX.test(seg)) {
      ROUTE_TOKEN_REGEX.lastIndex = 0;
      nodes.push(
        <button
          key={`route-${idx}`}
          type="button"
          onClick={() => onNavigateRoute(seg)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary-fixed/60 hover:bg-primary-fixed text-on-primary-fixed font-semibold text-[12px] transition-colors align-baseline"
        >
          <span>{seg}</span>
          <span className="material-symbols-outlined text-[13px]">arrow_outward</span>
        </button>
      );
      return;
    }
    ROUTE_TOKEN_REGEX.lastIndex = 0;

    // Render **bold** spans cleanly
    const boldParts = seg.split(/\*\*([^*]+)\*\*/g);
    boldParts.forEach((part, bIdx) => {
      if (!part) return;
      if (bIdx % 2 === 1) {
        nodes.push(
          <strong key={`b-${idx}-${bIdx}`} className="font-semibold text-on-surface">
            {part}
          </strong>
        );
      } else {
        nodes.push(<React.Fragment key={`t-${idx}-${bIdx}`}>{part}</React.Fragment>);
      }
    });
  });

  return nodes;
}

function FormattedModelMessage({
  text,
  onNavigateRoute,
}: {
  text: string;
  onNavigateRoute: (route: string) => void;
}) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentList.length === 0) return;
    blocks.push(
      <ul key={keyPrefix} className="list-disc pl-4 space-y-1">
        {currentList.map((item, idx) => (
          <li key={`${keyPrefix}-${idx}`} className="leading-relaxed">
            {renderFormattedInline(item, onNavigateRoute)}
          </li>
        ))}
      </ul>
    );
    currentList = [];
  };

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList(`list-${index}`);
      return;
    }

    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1]);
      return;
    }

    flushList(`list-${index}`);
    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderFormattedInline(trimmed, onNavigateRoute)}
      </p>
    );
  });

  flushList('list-final');

  return <div className="space-y-2">{blocks}</div>;
}

export function CampusChatbot() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, profile } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, messages.length, isSending, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleStartNewConversation = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    inFlightRef.current = false;
    setIsSending(false);
    setErrorBanner(null);
    setLastFailedPrompt(null);
    setInput('');
    setMessages([WELCOME_MESSAGE]);
    inputRef.current?.focus();
  };

  const sendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || inFlightRef.current) return;

      if (trimmed.length > MAX_MESSAGE_CHARS) {
        setErrorBanner(
          `Please keep your message within ${MAX_MESSAGE_CHARS} characters (currently ${trimmed.length}).`
        );
        return;
      }

      inFlightRef.current = true;
      setIsSending(true);
      setErrorBanner(null);
      setLastFailedPrompt(null);

      const nowTime = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const userBubble: ChatBubble = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: nowTime,
      };

      const priorHistory = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-8)
        .map((m) => ({ role: m.role, text: m.text }));

      setMessages((prev) => [...prev, userBubble]);
      setInput('');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: trimmed,
            history: priorHistory,
            currentPath: location.pathname + location.search,
          }),
          signal: controller.signal,
        });

        const payload = (await res.json().catch(() => ({}))) as {
          reply?: string;
          error?: string;
        };

        if (!res.ok || !payload.reply) {
          throw new Error(
            payload.error ||
              (res.status === 429
                ? 'Too many messages sent quickly. Please wait a few seconds and try again.'
                : 'Unable to get a response right now. Please try again.')
          );
        }

        const botBubble: ChatBubble = {
          id: `m-${Date.now()}`,
          role: 'model',
          text: payload.reply,
          timestamp: new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };

        setMessages((prev) => [...prev, botBubble]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const messageText =
          err instanceof Error && err.message
            ? err.message
            : 'Network error — check your connection and try again.';
        setErrorBanner(messageText);
        setLastFailedPrompt(trimmed);
      } finally {
        inFlightRef.current = false;
        setIsSending(false);
        abortControllerRef.current = null;
      }
    },
    [location.pathname, location.search, messages, session?.access_token]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleRetryLast = () => {
    if (!lastFailedPrompt || inFlightRef.current) return;
    // Remove the trailing failed user bubble before retrying cleanly so it does not duplicate
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'user' && last.text === lastFailedPrompt) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    void sendMessage(lastFailedPrompt);
  };

  const handleNavigateRoute = (route: string) => {
    navigate(route);
  };

  const hasUserMessages = messages.some((m) => m.role === 'user');
  const trimmedInputLength = input.trim().length;
  const overCharLimit = input.length > MAX_MESSAGE_CHARS;

  return (
    <>
      {/* Floating Launcher Button (Bottom-Right on Every Main Page, Clear of Mobile Bottom Nav) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open CampusCircle AI Assistant"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 h-13 pl-3.5 pr-4 rounded-2xl bg-gradient-to-r from-primary to-primary-container text-on-primary shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center gap-2.5 border border-white/15"
        >
          <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px] text-primary-fixed">
              smart_toy
            </span>
          </span>
          <span className="flex flex-col items-start text-left">
            <span className="text-label-md font-semibold leading-none">Ask CampusCircle</span>
            <span className="text-[10px] text-primary-fixed/95 font-medium mt-0.5 leading-none">
              Flats • Flatmates • Books
            </span>
          </span>
        </button>
      )}

      {/* Responsive Chat Window */}
      {isOpen && (
        <section
          role="dialog"
          aria-label="CampusCircle AI Assistant"
          className="fixed inset-x-3 bottom-20 top-18 sm:inset-auto sm:bottom-20 sm:right-4 lg:bottom-6 lg:right-6 sm:w-[400px] sm:h-[580px] sm:max-h-[calc(100vh-6rem)] z-50 bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/35 flex flex-col overflow-hidden"
        >
          {/* Stitch-Themed Header */}
          <div className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px] text-primary-fixed">
                  smart_toy
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-title-md font-semibold text-white leading-tight truncate">
                    CampusCircle Assistant
                  </h2>
                </div>
                <p className="text-[11px] text-primary-fixed truncate">
                  {profile?.full_name?.trim()
                    ? `Hi ${profile.full_name.trim().split(' ')[0]} • FlatMate & BookBridge Guide`
                    : 'FlatMate & BookBridge Guide'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleStartNewConversation}
                title="Start a new conversation"
                aria-label="Start a new conversation"
                className="h-8 px-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                <span>New</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close assistant"
                aria-label="Close assistant"
                className="w-8 h-8 rounded-lg hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3 bg-surface">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-body-sm shadow-2xs ${
                      isUser
                        ? 'bg-primary text-on-primary rounded-br-sm whitespace-pre-wrap break-words'
                        : 'bg-surface-container-lowest text-on-surface border border-outline-variant/25 rounded-bl-sm break-words'
                    }`}
                  >
                    {isUser ? (
                      msg.text
                    ) : (
                      <FormattedModelMessage
                        text={msg.text}
                        onNavigateRoute={handleNavigateRoute}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-outline mt-1 px-1">
                    {isUser ? `You • ${msg.timestamp}` : `Assistant • ${msg.timestamp}`}
                  </span>
                </div>
              );
            })}

            {/* Suggested Starter Questions (Shown at Start of Conversation) */}
            {!hasUserMessages && !isSending && (
              <div className="pt-1 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-outline px-1">
                  Suggested Questions
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void sendMessage(q)}
                      className="text-left px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-body-sm font-medium transition-colors flex items-center justify-between gap-2 border border-outline-variant/20"
                    >
                      <span>{q}</span>
                      <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
                        send
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading Typing Indicator */}
            {isSending && (
              <div className="flex flex-col items-start" role="status" aria-live="polite">
                <div className="bg-surface-container-lowest border border-outline-variant/25 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2 shadow-2xs">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-[12px] text-on-surface-variant font-medium">
                    Checking CampusCircle...
                  </span>
                </div>
              </div>
            )}

            {/* Error State with Retry */}
            {errorBanner && (
              <div className="p-3 rounded-xl bg-error-container text-on-error-container text-body-sm space-y-2">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[17px] text-error shrink-0 mt-0.5">
                    error
                  </span>
                  <p className="flex-1">{errorBanner}</p>
                </div>
                {lastFailedPrompt && !isSending && (
                  <button
                    type="button"
                    onClick={handleRetryLast}
                    className="h-7 px-3 rounded-lg bg-surface-container-lowest text-on-surface text-label-sm font-semibold shadow-2xs"
                  >
                    Retry Message
                  </button>
                )}
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* Composer Footer */}
          <form
            onSubmit={handleFormSubmit}
            className="p-3 bg-surface-container-lowest border-t border-outline-variant/25 space-y-1.5 shrink-0"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (errorBanner) setErrorBanner(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about flats, compatibility, or textbooks..."
                aria-label="Message CampusCircle Assistant"
                className="flex-1 min-h-[42px] max-h-28 py-2.5 px-3 rounded-xl bg-surface-container-low text-body-sm text-on-surface placeholder:text-outline resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                disabled={isSending || trimmedInputLength === 0 || overCharLimit}
                aria-label="Send message"
                className="h-[42px] w-[42px] rounded-xl bg-primary hover:bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-xs disabled:opacity-45 transition-colors"
              >
                <span className="material-symbols-outlined text-[19px]">send</span>
              </button>
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] text-outline">
              <span>Press Enter to send • Shift+Enter for new line</span>
              <span className={overCharLimit ? 'text-error font-semibold' : 'tabular-nums'}>
                {input.length}/{MAX_MESSAGE_CHARS}
              </span>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
