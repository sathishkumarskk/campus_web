import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatSupabaseError, isSupabaseConfigured, supabase } from '../lib/supabase';
import { canDisplayCollegeVerifiedBadge } from '../lib/verification';
import type { Conversation, Message, Profile } from '../types/database';
import { ReportModal } from '../components/ReportModal';

interface ConversationRow extends Conversation {
  p1?: Profile;
  p2?: Profile;
}

const CONTEXT_LABELS: Record<Conversation['context_type'], string> = {
  flatmate_connection: 'Flatmate Match',
  flat_request: 'Room Inquiry',
  book_request: 'BookBridge Handover',
};

export function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user, blockedUserIds, blockUser, unblockUser } = useAuth();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState<boolean>(isSupabaseConfigured);
  const [loadingMsgs, setLoadingMsgs] = useState<boolean>(false);
  const [draftBody, setDraftBody] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [reportPeer, setReportPeer] = useState<Profile | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    if (!isSupabaseConfigured || !user) {
      setLoadingConvs(false);
      return;
    }

    const { data, error } = await supabase
      .from('conversations')
      .select(
        '*, p1:profiles!conversations_participant_one_fkey(*), p2:profiles!conversations_participant_two_fkey(*)'
      )
      .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    if (!error && data) {
      const enriched = (data as ConversationRow[]).map((c) => ({
        ...c,
        peer: c.participant_one === user.id ? c.p2 : c.p1,
      }));
      setConversations(enriched);
    }
    setLoadingConvs(false);
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Auto-select first conversation on desktop when none specified
  useEffect(() => {
    if (!conversationId && conversations.length > 0 && window.innerWidth >= 1024) {
      navigate(`/messages/${conversations[0].id}`, { replace: true });
    }
  }, [conversationId, conversations, navigate]);

  const activeConversation = conversations.find((c) => c.id === conversationId) || null;
  const activePeer = activeConversation?.peer || null;
  const isPeerBlocked = Boolean(activePeer && blockedUserIds.has(activePeer.id));

  // Load thread messages + subscribe to Supabase Realtime INSERTs
  useEffect(() => {
    if (!isSupabaseConfigured || !user || !conversationId) {
      setMessages([]);
      return;
    }

    let active = true;
    setLoadingMsgs(true);

    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(async ({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          setMessages(data as Message[]);
          const unreadIds = (data as Message[])
            .filter((m) => m.sender_id !== user.id && !m.is_read)
            .map((m) => m.id);
          if (unreadIds.length > 0) {
            await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
          }
        }
        setLoadingMsgs(false);
      });

    const channel = supabase
      .channel(`conversation-thread:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          if (incoming.sender_id !== user.id) {
            await supabase.from('messages').update({ is_read: true }).eq('id', incoming.id);
          }
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadConversations, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftBody.trim();
    if (!trimmed || !user || !conversationId || isPeerBlocked) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          body: trimmed,
        })
        .select('*')
        .single();

      if (error) throw new Error(formatSupabaseError(error));

      if (data) {
        const created = data as Message;
        setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      }
      setDraftBody('');
      await loadConversations();
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Message could not be sent',
        description: formatSupabaseError(err),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-4">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xs overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[72vh]">
        {/* Left Sidebar: Conversations List */}
        <aside
          className={`lg:col-span-4 border-r border-surface-container flex flex-col ${
            conversationId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b border-surface-container flex items-center justify-between">
            <div>
              <h1 className="text-title-md font-semibold text-on-surface">Campus Messages</h1>
              <p className="text-body-sm text-on-surface-variant">
                Authorized peer threads ({conversations.length})
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-surface-container">
            {loadingConvs ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-16 rounded-xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center space-y-2.5">
                <span className="material-symbols-outlined text-[28px] text-primary">chat</span>
                <p className="text-title-md font-semibold text-on-surface">
                  No active conversations yet
                </p>
                <p className="text-body-sm text-on-surface-variant">
                  Direct 1:1 chats unlock automatically when a flatmate intro, room inquiry, or
                  textbook reservation is accepted.
                </p>
                <div className="flex justify-center gap-2 pt-1">
                  <Link
                    to="/flatmates"
                    className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold flex items-center"
                  >
                    Find Flatmates
                  </Link>
                  <Link
                    to="/books"
                    className="h-9 px-3.5 rounded-lg bg-secondary text-on-secondary text-label-sm font-semibold flex items-center"
                  >
                    BookBridge
                  </Link>
                </div>
              </div>
            ) : (
              conversations.map((conv) => {
                const selected = conv.id === conversationId;
                const peerName = conv.peer?.full_name || 'Campus Peer';
                return (
                  <Link
                    key={conv.id}
                    to={`/messages/${conv.id}`}
                    className={`block p-3.5 transition-colors ${
                      selected
                        ? 'bg-primary-fixed/25'
                        : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-md font-semibold text-on-surface truncate">
                        {peerName}
                      </span>
                      <span className="text-[11px] text-outline shrink-0">
                        {new Date(conv.last_message_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-primary font-semibold mt-0.5 truncate">
                      {CONTEXT_LABELS[conv.context_type]}
                      {conv.context_title ? ` • ${conv.context_title}` : ''}
                    </p>
                    <p className="text-body-sm text-on-surface-variant line-clamp-1 mt-0.5">
                      {conv.last_message_preview || 'Chat unlocked — say hello!'}
                    </p>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Pane: Active Message Thread */}
        <section
          className={`lg:col-span-8 flex flex-col ${
            conversationId ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px] text-outline mb-2">
                forum
              </span>
              <p className="text-body-md">Select a conversation on the left to view messages.</p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-surface-container flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Link
                    to="/messages"
                    aria-label="Back to conversation list"
                    className="lg:hidden w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                  </Link>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-title-md font-semibold text-on-surface truncate">
                        {activePeer?.full_name || 'Campus Peer'}
                      </h2>
                      {canDisplayCollegeVerifiedBadge(activePeer) && (
                        <span className="material-symbols-outlined text-[15px] text-primary material-icon-filled">
                          verified
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-on-surface-variant truncate">
                      {CONTEXT_LABELS[activeConversation.context_type]}
                      {activeConversation.context_title
                        ? ` • ${activeConversation.context_title}`
                        : ''}
                    </p>
                  </div>
                </div>

                {activePeer && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setReportPeer(activePeer)}
                      className="h-8 px-2.5 rounded-lg bg-surface-container text-on-surface-variant text-label-sm font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[15px]">flag</span>
                      <span>Report</span>
                    </button>

                    {isPeerBlocked ? (
                      <button
                        type="button"
                        onClick={() => unblockUser(activePeer.id)}
                        className="h-8 px-2.5 rounded-lg bg-surface-container-highest text-on-surface text-label-sm font-semibold"
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await blockUser(activePeer.id, 'Blocked from chat');
                          showToast({ variant: 'info', title: 'Peer blocked' });
                        }}
                        className="h-8 px-2.5 rounded-lg bg-error-container text-on-error-container text-label-sm font-semibold"
                      >
                        Block
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Messages Feed */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-surface max-h-[55vh]">
                {loadingMsgs ? (
                  <div className="space-y-2">
                    <div className="h-12 w-2/3 rounded-xl bg-surface-container animate-pulse" />
                    <div className="h-12 w-1/2 ml-auto rounded-xl bg-surface-container animate-pulse" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-body-sm text-on-surface-variant">
                    Start coordinating your visit, flatmate routine, or safe campus book handover.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const mine = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-body-md whitespace-pre-wrap ${
                            mine
                              ? 'bg-primary text-on-primary rounded-br-sm'
                              : 'bg-surface-container-lowest text-on-surface shadow-xs rounded-bl-sm'
                          }`}
                        >
                          {msg.body}
                        </div>
                        <span className="text-[10px] text-outline mt-1 px-1">
                          {new Date(msg.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {mine && msg.is_read ? ' • Read' : ''}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              {isPeerBlocked ? (
                <div className="p-3.5 bg-surface-container-low text-center text-body-sm text-on-surface-variant">
                  You have blocked this user. Unblock to send or receive new messages.
                </div>
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-surface-container bg-surface-container-lowest flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={2000}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write a message..."
                    className="flex-1 h-11 px-4 rounded-xl bg-surface-container-low text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draftBody.trim()}
                    className="h-11 px-5 rounded-xl bg-primary text-on-primary text-label-md font-semibold disabled:opacity-45 flex items-center gap-1"
                  >
                    <span>Send</span>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {reportPeer && (
        <ReportModal
          isOpen={Boolean(reportPeer)}
          onClose={() => setReportPeer(null)}
          targetType="message"
          targetTitle={`Conversation with ${reportPeer.full_name}`}
          targetUserId={reportPeer.id}
        />
      )}
    </div>
  );
}
