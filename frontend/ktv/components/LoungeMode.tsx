// ktv/components/LoungeMode.tsx
// Màn hình mặc định của KTV Room — mọi người nghe nhạc cùng nhau, chat,
// xin mic, request bài, tặng quà/reaction.
//
// REFACTOR: chat + gift giờ dùng chung SocialPanel/GiftPanel (bước 4, 5)
// thay vì tự chứa logic như bản đầu tiên. Nếu bạn còn giữ bản LoungeMode.tsx
// cũ (tự chứa chat/gift), THAY THẾ TOÀN BỘ bằng file này.

"use client";

import { useMemo, useState } from "react";
import { ktvTheme as T, glass, springTransition, audienceStatusMeta } from "../theme";
import type { AudienceStatus } from "../theme";
import MicSlotGrid from "./MicSlotGrid";
import SocialPanel, { FloatingReactions, type ActivityItem, type FloatingReactionEntry } from "./SocialPanel";
import GiftPanel from "./GiftPanel";
import type {
  RoomState,
  Participant,
  ChatMessage,
  MicSlotArray,
  SongQueueItem,
} from "@/types/websocket";

interface RemoteStreamEntry {
  userId: string;
  stream: MediaStream;
}

interface GiftOption {
  type: string;
  emoji: string;
  name: string;
  cost: number;
}

export interface LoungeModeProps {
  roomState: RoomState;
  myUserId: string;
  isHost: boolean;
  connected: boolean;

  // ── Chat & Activity ──
  messages: ChatMessage[];
  isLoadingChat: boolean;
  onSendChat: (content: string) => void;
  activityItems: ActivityItem[];

  // ── Mic / Camera ──
  micSlots: MicSlotArray;
  localStream: MediaStream | null;
  remoteStreams: RemoteStreamEntry[];
  myCameraOn: boolean;
  onRequestMic: () => void;
  onKickMic: (userId: string) => void;
  onToggleMyCamera: (on: boolean) => void;

  // ── Song queue ──
  queue: SongQueueItem[];
  onAddSong: (song: { title: string; artist: string; url: string }) => void;
  onRemoveSong: (id: string) => void;

  // ── Gift ──
  onSendGift: (toUserId: string, toUserName: string, gift: GiftOption) => void;

  // ── Reaction (local-only optimistic — xem ghi chú SocialPanel) ──
  onSendReaction?: (emoji: string) => void;
}

function avatarGradient(id: string): string {
  const h1 = (id.charCodeAt(0) * 53) % 360;
  const h2 = (id.charCodeAt(id.length - 1 || 0) * 97) % 360;
  return `linear-gradient(145deg, hsl(${h1},38%,32%), hsl(${h2},42%,44%))`;
}

export default function LoungeMode({
  roomState,
  myUserId,
  isHost,
  connected,
  messages,
  isLoadingChat,
  onSendChat,
  activityItems,
  micSlots,
  localStream,
  remoteStreams,
  myCameraOn,
  onRequestMic,
  onKickMic,
  onToggleMyCamera,
  queue,
  onAddSong,
  onRemoveSong,
  onSendGift,
  onSendReaction,
}: LoungeModeProps) {
  const [showQueue, setShowQueue] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [songForm, setSongForm] = useState({ title: "", artist: "", url: "" });
  const [floatingReactions, setFloatingReactions] = useState<FloatingReactionEntry[]>([]);

  const participants: Participant[] = roomState.participants ?? [];
  const micRequestCount = roomState.micRequests?.length ?? 0;

  const recentChatterIds = useMemo(() => {
    const cutoff = Date.now() - 8000;
    const ids = new Set<string>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const ts = m.timestamp ?? (m.createdAt ? new Date(m.createdAt).getTime() : 0);
      if (ts < cutoff) break;
      if (m.senderId) ids.add(m.senderId);
    }
    return ids;
  }, [messages]);

  const statusOf = (p: Participant): AudienceStatus => {
    const slot = micSlots.find((s) => s?.userId === p.id);
    if (slot?.cameraOn) return "camera_on";
    if (slot) return "on_mic";
    if (roomState.micRequests?.some((r) => r.userId === p.id)) return "waiting";
    if (recentChatterIds.has(p.id)) return "chatting";
    return "listening";
  };

  const songCoverLetter = (roomState.songTitle || roomState.currentSong || "?")[0]?.toUpperCase();

  const addSong = () => {
    if (!songForm.title.trim()) return;
    onAddSong({
      title: songForm.title.trim(),
      artist: songForm.artist.trim() || "Unknown",
      url: songForm.url.trim() || "",
    });
    setSongForm({ title: "", artist: "", url: "" });
  };

  // Reaction bắn ra từ SocialPanel → nổi lên góc dưới-phải màn Lounge, đồng
  // thời báo cho orchestrator qua onSendReaction (hiện local-only, xem ghi
  // chú ở SocialPanel.tsx).
  const handleReaction = (emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setFloatingReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2200);
    onSendReaction?.(emoji);
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        fontFamily: T.font,
        color: T.text,
        overflow: "hidden",
      }}
    >
      <FloatingReactions items={floatingReactions} style={{ right: 24, bottom: 90 }} />

      {/* ═══ CỘT TRÁI — Mic thu gọn + Audience ═══ */}
      <aside
        style={{
          width: 272,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          padding: "18px 16px",
          borderRight: `1px solid ${T.border}`,
          overflowY: "auto",
        }}
      >
        <MicSlotGrid
          slots={micSlots}
          myUserId={myUserId}
          isHost={isHost}
          localStream={localStream}
          remoteStreams={remoteStreams}
          micRequestCount={micRequestCount}
          onRequestMic={onRequestMic}
          onKick={onKickMic}
          onToggleMyCamera={onToggleMyCamera}
          myCameraOn={myCameraOn}
        />

        <div style={{ height: 1, background: T.border }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: T.textLow,
            }}
          >
            Khán giả · {participants.length}
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
            {participants.map((p) => {
              const status = statusOf(p);
              const meta = audienceStatusMeta[status];
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 9px",
                    borderRadius: 12,
                    background: p.id === myUserId ? T.keyLo : "rgba(255,255,255,.025)",
                    border: `1px solid ${p.id === myUserId ? "rgba(226,65,84,.25)" : T.border}`,
                    transition: springTransition,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: avatarGradient(p.id),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {p.name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name} {p.isHost && "👑"}
                    </div>
                    <div style={{ fontSize: 10, color: T.textLow, marginTop: 1 }}>
                      {meta.icon} {meta.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ═══ GIỮA — Now playing + song queue ═══ */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "18px 22px",
          overflowY: "auto",
          minWidth: 0,
        }}
      >
        <div
          style={{
            borderRadius: T.radiusCard,
            padding: "20px 22px",
            border: `1px solid ${T.border}`,
            ...glass(0.035),
            boxShadow: "0 4px 28px rgba(0,0,0,.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 14,
                flexShrink: 0,
                background: "linear-gradient(145deg,#3a3a3a,#232323)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                color: T.textMid,
                boxShadow: roomState.isPlaying ? `0 0 0 1px ${T.keyLo}, 0 6px 20px ${T.keyGlow}` : "none",
                transition: springTransition,
              }}
            >
              {songCoverLetter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: roomState.isPlaying ? T.key : T.textLow,
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {roomState.isPlaying ? (
                  <>
                    <EqBars /> Đang phát
                  </>
                ) : (
                  "⏸ Tạm dừng"
                )}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {roomState.songTitle || "Chưa có bài nào đang phát"}
              </div>
              {roomState.songArtist && (
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>{roomState.songArtist}</div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: T.radiusCardSm,
            overflow: "hidden",
            border: `1px solid ${T.border}`,
            background: "rgba(255,255,255,.02)",
          }}
        >
          <button
            onClick={() => setShowQueue(!showQueue)}
            style={{
              width: "100%",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.textMid,
              fontSize: 13,
              fontWeight: 500,
              fontFamily: T.font,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              🎵 Hàng đợi bài hát
              <span
                style={{
                  padding: "1px 9px",
                  borderRadius: T.radiusPill,
                  fontSize: 11,
                  background: queue.length > 0 ? T.keyLo : "rgba(255,255,255,.05)",
                  color: queue.length > 0 ? T.key : T.textLow,
                  border: `1px solid ${queue.length > 0 ? "rgba(226,65,84,.3)" : T.border}`,
                }}
              >
                {queue.length} bài
              </span>
            </span>
            <span
              style={{
                fontSize: 10,
                transition: springTransition,
                transform: showQueue ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▼
            </span>
          </button>

          {showQueue && (
            <div style={{ borderTop: `1px solid ${T.border}` }}>
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  gap: 6,
                  borderBottom: `1px solid ${T.border}`,
                  background: "rgba(0,0,0,.15)",
                }}
              >
                <input
                  placeholder="Tên bài *"
                  value={songForm.title}
                  onChange={(e) => setSongForm((p) => ({ ...p, title: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSong();
                  }}
                  style={inputStyle}
                />
                <input
                  placeholder="Nghệ sĩ"
                  value={songForm.artist}
                  onChange={(e) => setSongForm((p) => ({ ...p, artist: e.target.value }))}
                  style={{ ...inputStyle, maxWidth: 110 }}
                />
                <button onClick={addSong} style={primaryBtnStyle}>
                  + Thêm
                </button>
              </div>

              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {queue.length === 0 ? (
                  <div style={{ padding: 18, textAlign: "center", fontSize: 12, color: T.textLow }}>
                    Hàng đợi trống — thêm bài để cùng nghe nhé
                  </div>
                ) : (
                  queue.map((s, i) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 14px",
                        borderBottom: "1px solid rgba(255,255,255,.03)",
                        background: i === 0 ? T.keyLo : "transparent",
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          flexShrink: 0,
                          background: i === 0 ? T.key : "rgba(255,255,255,.07)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: i === 0 ? "#fff" : T.textLow,
                        }}
                      >
                        {i === 0 ? "▶" : i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.title}
                        </div>
                        <div style={{ fontSize: 10, color: T.textLow }}>
                          {s.artist} · {s.requestedByName}
                        </div>
                      </div>
                      {(isHost || s.requestedBy === myUserId) && (
                        <button
                          onClick={() => onRemoveSong(s.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: T.textLow,
                            cursor: "pointer",
                            fontSize: 18,
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ═══ CỘT PHẢI — Chat/Activity + Gift, dùng chung SocialPanel/GiftPanel ═══ */}
      <SocialPanel
        messages={messages}
        isLoadingChat={isLoadingChat}
        onSendChat={onSendChat}
        connected={connected}
        activityItems={activityItems}
        onSendReaction={handleReaction}
        giftOpen={showGift}
        onToggleGift={() => setShowGift((v) => !v)}
        giftSlot={
          <GiftPanel
            participants={participants}
            myUserId={myUserId}
            onSendGift={onSendGift}
            onClose={() => setShowGift(false)}
          />
        }
      />
    </div>
  );
}

function EqBars() {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 10 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 2,
            background: T.key,
            borderRadius: 1,
            animation: `loungeEq 1s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes loungeEq {
          0%, 100% { height: 3px; }
          50% { height: 10px; }
        }
      `}</style>
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,.06)",
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "7px 10px",
  color: T.text,
  fontSize: 12,
  outline: "none",
  fontFamily: T.font,
  minWidth: 0,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "0 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: T.key,
  color: "white",
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0,
  fontFamily: T.font,
};