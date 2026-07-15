// ktv/components/PerformanceMode.tsx
// Màn hình khi có người đang được spotlight trình diễn.
//
// REFACTOR: chat + gift giờ dùng chung SocialPanel/GiftPanel (bước 4, 5)
// thay vì tự chứa logic như bản đầu tiên. Nếu bạn còn giữ bản
// PerformanceMode.tsx cũ (tự chứa chat/gift), THAY THẾ TOÀN BỘ bằng file
// này. Toàn bộ phần Spotlight Stage/lyrics/visualizer/like GIỮ NGUYÊN.

"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ktvTheme as T, springTransition } from "../theme";
import SocialPanel, { FloatingReactions, type ActivityItem, type FloatingReactionEntry } from "./SocialPanel";
import GiftPanel from "./GiftPanel";
import type {
  RoomState,
  Participant,
  ChatMessage,
  MicSlotArray,
  Performance,
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

export interface PerformanceModeProps {
  roomState: RoomState;
  performance: Performance;
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
  onToggleMyCamera: (on: boolean) => void;

  // ── Gift ──
  onSendGift: (toUserId: string, toUserName: string, gift: GiftOption) => void;

  // ── Reaction (local-only, xem ghi chú SocialPanel) ──
  onSendReaction?: (emoji: string) => void;

  // ── Performance actions ──
  onLike: () => void;
  onEndPerformance: () => void;

  // ── Lyrics — CHƯA có field ở backend, để optional cho tương lai ──
  lyrics?: string[];
  albumCoverUrl?: string;
}

function avatarGradient(id: string): string {
  const h1 = (id.charCodeAt(0) * 53) % 360;
  const h2 = (id.charCodeAt(id.length - 1 || 0) * 97) % 360;
  return `linear-gradient(145deg, hsl(${h1},38%,32%), hsl(${h2},42%,44%))`;
}

export default function PerformanceMode({
  roomState,
  performance,
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
  onToggleMyCamera,
  onSendGift,
  onSendReaction,
  onLike,
  onEndPerformance,
  lyrics,
  albumCoverUrl,
}: PerformanceModeProps) {
  const [showGift, setShowGift] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReactionEntry[]>([]);
  const [stageBursts, setStageBursts] = useState<{ id: string; emoji: string; kind: string; xOffset: number }[]>([]);

  const participants: Participant[] = roomState.participants ?? [];

  const singerSlot = useMemo(
    () => micSlots.find((s) => s?.userId === performance.singerId) ?? null,
    [micSlots, performance.singerId]
  );
  const singerStream =
    performance.singerId === myUserId
      ? localStream
      : remoteStreams.find((r) => r.userId === performance.singerId)?.stream ?? null;

  const otherMicHolders = useMemo(
    () => micSlots.filter((s) => s && s.userId !== performance.singerId),
    [micSlots, performance.singerId]
  );

  const audienceOnly = useMemo(
    () => participants.filter((p) => !micSlots.some((s) => s?.userId === p.id)),
    [participants, micSlots]
  );

  const canEnd = isHost || myUserId === performance.singerId;
  const iAmSinger = myUserId === performance.singerId;

  // Bay lên GIỮA sân khấu (khác vị trí Lounge — góc dưới-phải) — dùng riêng
  // state stageBursts (motion tuỳ biến hơn FloatingReactions dùng chung) cho
  // hiệu ứng like/reaction to hơn, đúng cảm giác "trọng tâm" của Performance.
  const fireStageBurst = (emoji: string, kind: "reaction" | "like") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setStageBursts((prev) => [...prev, { id, emoji, kind, xOffset: (Math.random() - 0.5) * 40 }]);
    setTimeout(() => setStageBursts((prev) => prev.filter((r) => r.id !== id)), 2200);
  };

  const handleLike = () => {
    fireStageBurst("❤️", "like");
    onLike();
  };

  // Reaction bắn từ SocialPanel (chat toolbar) → nổi lên giữa sân khấu,
  // đồng thời báo lên orchestrator.
  const handleReaction = (emoji: string) => {
    fireStageBurst(emoji, "reaction");
    onSendReaction?.(emoji);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        fontFamily: T.font,
        color: T.text,
        overflow: "hidden",
      }}
    >
      {/* ═══ CỘT TRÁI — rìa: các ghế mic khác + audience thu nhỏ ═══ */}
      <aside
        style={{
          width: 200,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "18px 14px",
          borderRight: `1px solid ${T.border}`,
          overflowY: "auto",
        }}
      >
        {otherMicHolders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={sectionLabelStyle}>Ghế mic khác</span>
            {otherMicHolders.map((s) => (
              <div
                key={s!.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 12,
                  border: `1px solid ${s!.isSpeaking ? "rgba(226,65,84,.4)" : T.border}`,
                  background: "rgba(255,255,255,.025)",
                  boxShadow: s!.isSpeaking ? `0 0 0 2px ${T.keyGlow}` : "none",
                  transition: springTransition,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: avatarGradient(s!.userId),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {s!.userName[0]?.toUpperCase() ?? "?"}
                </div>
                <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s!.userName}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
          <span style={sectionLabelStyle}>Khán giả · {audienceOnly.length}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, overflowY: "auto" }}>
            {audienceOnly.map((p) => (
              <div
                key={p.id}
                title={p.name}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: avatarGradient(p.id),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {p.name[0]?.toUpperCase() ?? "?"}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ═══ GIỮA — Spotlight Stage ═══ */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "24px",
          minWidth: 0,
          position: "relative",
        }}
      >
        {/* floating like/reaction — bay lên giữa sân khấu */}
        <div style={{ position: "absolute", left: "50%", bottom: 140, zIndex: 60, pointerEvents: "none", transform: "translateX(-50%)" }}>
          <AnimatePresence>
            {stageBursts.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 0, scale: 0.6, x: r.xOffset }}
                animate={{ opacity: [0, 1, 1, 0], y: -110, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.1, ease: "easeOut" }}
                style={{ position: "absolute", fontSize: r.kind === "like" ? 30 : 24 }}
              >
                {r.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: albumCoverUrl ? `url(${albumCoverUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(60px) brightness(.4)",
            opacity: albumCoverUrl ? 0.5 : 0,
            transform: "scale(1.2)",
            pointerEvents: "none",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ position: "relative", zIndex: 1, textAlign: "center" }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: T.key, letterSpacing: ".1em", textTransform: "uppercase" }}>
            🎤 Đang trình diễn
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{performance.songTitle || "Chưa rõ tên bài"}</div>
          {performance.songArtist && (
            <div style={{ fontSize: 13, color: T.textMid, marginTop: 2 }}>{performance.songArtist}</div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
          style={{
            position: "relative",
            width: "min(420px, 60vh)",
            aspectRatio: "1",
            borderRadius: T.radiusCard,
            overflow: "hidden",
            background: singerSlot?.cameraOn && singerStream ? "#000" : avatarGradient(performance.singerId),
            border: `1px solid rgba(226,65,84,.4)`,
            boxShadow: `0 0 0 4px ${T.keyGlow}, 0 20px 60px rgba(226,65,84,.25)`,
            zIndex: 1,
          }}
        >
          {singerSlot?.cameraOn && singerStream ? (
            <video
              autoPlay
              playsInline
              muted={iAmSinger}
              ref={(el) => {
                if (el && el.srcObject !== singerStream) el.srcObject = singerStream;
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: iAmSinger ? "scaleX(-1)" : "none",
              }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div
                style={{
                  width: "38%",
                  aspectRatio: "1",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,.14)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22%",
                  fontWeight: 700,
                  color: "rgba(255,255,255,.9)",
                }}
              >
                {performance.singerName[0]?.toUpperCase() ?? "?"}
              </div>
            </div>
          )}

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "16px 18px",
              background: "linear-gradient(to top, rgba(0,0,0,.7), transparent)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <VisualizerBars active={roomState.isPlaying} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
                {performance.singerName}
              </span>
              {performance.giftScore > 0 && (
                <span
                  style={{
                    padding: "2px 9px",
                    borderRadius: T.radiusPill,
                    background: "rgba(0,0,0,.4)",
                    backdropFilter: "blur(8px)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fff",
                  }}
                >
                  🎁 {performance.giftScore}
                </span>
              )}
            </div>
          </div>

          {iAmSinger && (
            <button
              onClick={() => onToggleMyCamera(!myCameraOn)}
              title={myCameraOn ? "Tắt camera" : "Bật camera"}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "none",
                background: "rgba(0,0,0,.45)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {myCameraOn ? "📹" : "📷"}
            </button>
          )}
        </motion.div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 460,
            textAlign: "center",
            minHeight: 44,
            color: T.textMid,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          {lyrics && lyrics.length > 0 ? (
            lyrics.slice(0, 2).map((line, i) => (
              <div key={i} style={{ opacity: i === 0 ? 1 : 0.5, color: i === 0 ? T.text : T.textMid }}>
                {line}
              </div>
            ))
          ) : (
            <span style={{ opacity: 0.4 }}>🎶 Đang hát theo cảm xúc...</span>
          )}
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleLike}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 18px",
              borderRadius: T.radiusPill,
              border: `1px solid ${T.border}`,
              background: "rgba(255,255,255,.05)",
              color: T.text,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: springTransition,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = T.keyLo)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)")}
          >
            ❤️ {performance.likes}
          </button>

          {canEnd && (
            <button
              onClick={onEndPerformance}
              style={{
                padding: "9px 16px",
                borderRadius: T.radiusPill,
                border: "1px solid rgba(226,65,84,.4)",
                background: T.keyLo,
                color: T.key,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: springTransition,
              }}
            >
              Kết thúc trình diễn
            </button>
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
            defaultTargetId={performance.singerId}
            targetBadges={{ [performance.singerId]: "🎤" }}
          />
        }
      />
    </motion.div>
  );
}

function VisualizerBars({ active }: { active: boolean }) {
  const bars = 20;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 1.5,
            background: "rgba(226,65,84,.85)",
            height: active ? undefined : 3,
            animation: active ? `pfVis 1.1s ease-in-out ${(i % 6) * 0.1}s infinite` : "none",
          }}
        />
      ))}
      <style>{`
        @keyframes pfVis {
          0%, 100% { height: 3px; opacity: .5; }
          50% { height: 20px; opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: T.textLow,
};