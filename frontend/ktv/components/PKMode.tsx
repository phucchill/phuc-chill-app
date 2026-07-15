// ktv/components/PKMode.tsx
// Split-screen PK Battle giữa 2 người đang giữ mic. Tái dùng logic nghiệp vụ
// từ PKBar/WinnerOverlay bản cũ (đếm ngược, vote, split bar, winner overlay)
// nhưng đổi hoàn toàn theme tím/hồng cũ → #1f1f1f/#e24154 theo ktv/theme.ts.
// Component THUẦN PRESENTATIONAL — không tự mở WebSocket, không tự tính
// thắng/thua (server đã tính, gửi PK_RESULT xuống).
//
// Khi PK_RESULT về → server tự SetMode(lounge) + broadcast ROOM_MODE_UPDATE,
// nên component này KHÔNG tự chuyển mode — chỉ hiện WinnerOverlay trong lúc
// chờ, orchestrator (page.tsx) sẽ tự unmount PKMode khi roomState.mode đổi.

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ktvTheme as T, springTransition } from "../theme";
import type { MicSlotArray, PKState, PKResultPayload } from "@/types/websocket";

interface RemoteStreamEntry {
  userId: string;
  stream: MediaStream;
}

export interface PKModeProps {
  pk: PKState; // parent chỉ render PKMode khi có trận đang diễn ra
  result: PKResultPayload | null; // set khi PK_RESULT vừa về, null sau khi overlay tự đóng
  onResultDismissed: () => void;

  myUserId: string;
  micSlots: MicSlotArray;
  localStream: MediaStream | null;
  remoteStreams: RemoteStreamEntry[];

  onVote: (side: "challenger" | "opponent") => void;
}

function avatarGradient(id: string): string {
  const h1 = (id.charCodeAt(0) * 53) % 360;
  const h2 = (id.charCodeAt(id.length - 1 || 0) * 97) % 360;
  return `linear-gradient(145deg, hsl(${h1},38%,32%), hsl(${h2},42%,44%))`;
}

export default function PKMode({
  pk,
  result,
  onResultDismissed,
  myUserId,
  micSlots,
  localStream,
  remoteStreams,
  onVote,
}: PKModeProps) {
  const challengerSlot = micSlots.find((s) => s?.userId === pk.challengerId) ?? null;
  const opponentSlot = micSlots.find((s) => s?.userId === pk.opponentId) ?? null;

  const isPlayer = myUserId === pk.challengerId || myUserId === pk.opponentId;
  const voted = pk.votedUsers.includes(myUserId);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font,
        color: T.text,
        overflow: "hidden",
      }}
    >
      <AnimatePresence>
        {result && <WinnerOverlay result={result} onDone={onResultDismissed} />}
      </AnimatePresence>

      <PKHeader pk={pk} />

      {/* ═══ split screen ═══ */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <PKSide
          role="challenger"
          userId={pk.challengerId}
          name={pk.challengerName}
          score={pk.challengerScore}
          slot={challengerSlot}
          stream={pk.challengerId === myUserId ? localStream : remoteStreams.find((r) => r.userId === pk.challengerId)?.stream ?? null}
          isMe={pk.challengerId === myUserId}
          leading={pk.challengerScore >= pk.opponentScore}
        />

        {/* vs divider */}
        <div
          style={{
            width: 2,
            background: `linear-gradient(to bottom, transparent, ${T.key}, transparent)`,
            flexShrink: 0,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: T.background,
              border: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: T.textMid,
              zIndex: 2,
            }}
          >
            VS
          </div>
        </div>

        <PKSide
          role="opponent"
          userId={pk.opponentId}
          name={pk.opponentName}
          score={pk.opponentScore}
          slot={opponentSlot}
          stream={pk.opponentId === myUserId ? localStream : remoteStreams.find((r) => r.userId === pk.opponentId)?.stream ?? null}
          isMe={pk.opponentId === myUserId}
          leading={pk.opponentScore > pk.challengerScore}
        />
      </div>

      {/* ═══ vote bar dưới cùng ═══ */}
      {!isPlayer && !voted && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 10,
            padding: "14px 20px",
            borderTop: `1px solid ${T.border}`,
            background: "rgba(0,0,0,.25)",
          }}
        >
          <VoteButton label={pk.challengerName} onClick={() => onVote("challenger")} />
          <VoteButton label={pk.opponentName} onClick={() => onVote("opponent")} />
        </div>
      )}
      {(voted || isPlayer) && (
        <div
          style={{
            flexShrink: 0,
            textAlign: "center",
            padding: "12px 20px",
            fontSize: 12,
            color: T.textLow,
            borderTop: `1px solid ${T.border}`,
            background: "rgba(0,0,0,.25)",
          }}
        >
          {isPlayer ? "Bạn đang thi đấu" : "Đã vote ✓"}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Header: đếm ngược + tổng điểm + split bar ────────────────────────────── */
function PKHeader({ pk }: { pk: PKState }) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((pk.endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((pk.endsAt - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [pk.endsAt]);

  const total = Math.max(pk.challengerScore + pk.opponentScore, 1);
  const cPct = (pk.challengerScore / total) * 100;
  const urgent = left <= 10;

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "14px 20px 12px",
        borderBottom: `1px solid ${T.border}`,
        background: "rgba(0,0,0,.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: T.key,
          }}
        >
          ⚔️ PK Battle
        </span>
        <div
          style={{
            padding: "3px 12px",
            borderRadius: T.radiusPill,
            background: urgent ? T.keyLo : "rgba(255,255,255,.06)",
            border: `1px solid ${urgent ? "rgba(226,65,84,.4)" : T.border}`,
            fontSize: 13,
            fontWeight: 700,
            color: urgent ? T.key : T.textMid,
            fontVariantNumeric: "tabular-nums",
            transition: springTransition,
          }}
        >
          {left}s
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${cPct}%`,
            background: T.key,
            opacity: 0.9,
            transition: "width .5s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ─── 1 bên của split-screen ───────────────────────────────────────────────── */
function PKSide({
  name,
  score,
  slot,
  stream,
  isMe,
  leading,
}: {
  role: "challenger" | "opponent";
  userId: string;
  name: string;
  score: number;
  slot: MicSlotArray[number];
  stream: MediaStream | null;
  isMe: boolean;
  leading: boolean;
}) {
  const showVideo = slot?.cameraOn && stream;

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        minWidth: 0,
        background: showVideo ? "#000" : avatarGradient(slot?.userId ?? name),
        transition: springTransition,
        boxShadow: leading ? `inset 0 0 0 3px ${T.keyGlow}` : "none",
      }}
    >
      {showVideo ? (
        <video
          autoPlay
          playsInline
          muted={isMe}
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: isMe ? "scaleX(-1)" : "none",
          }}
        />
      ) : (
        <div
          style={{
            width: "26%",
            aspectRatio: "1",
            borderRadius: "50%",
            background: "rgba(255,255,255,.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14%",
            fontWeight: 700,
            color: "rgba(255,255,255,.9)",
          }}
        >
          {name[0]?.toUpperCase() ?? "?"}
        </div>
      )}

      {/* scrim */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "40%",
          background: "linear-gradient(to top, rgba(0,0,0,.65), transparent)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 18,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            textShadow: "0 1px 4px rgba(0,0,0,.5)",
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            padding: "0 12px",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: leading ? T.key : "rgba(255,255,255,.85)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            textShadow: "0 2px 8px rgba(0,0,0,.4)",
          }}
        >
          {score}
        </div>
      </div>
    </div>
  );
}

function VoteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "11px 0",
        borderRadius: T.radiusCardSm,
        cursor: "pointer",
        fontWeight: 600,
        border: `1px solid ${T.border}`,
        background: "rgba(255,255,255,.05)",
        color: T.text,
        fontSize: 13,
        fontFamily: T.font,
        transition: springTransition,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = T.keyLo;
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(226,65,84,.4)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)";
        (e.currentTarget as HTMLElement).style.borderColor = T.border;
      }}
    >
      👍 {label}
    </button>
  );
}

/* ─── Winner overlay — fade/scale mềm, KHÔNG bounce/flash/confetti gaming ──── */
function WinnerOverlay({ result, onDone }: { result: PKResultPayload; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(20px)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ textAlign: "center" }}
      >
        <div style={{ fontSize: 56, marginBottom: 10 }}>🏆</div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: T.text,
            marginBottom: 6,
            letterSpacing: "-.01em",
          }}
        >
          {result.winnerName}
        </div>
        <div style={{ fontSize: 13, color: T.textMid, marginBottom: 24, letterSpacing: ".04em" }}>
          chiến thắng!
        </div>
        <div style={{ display: "flex", gap: 28, justifyContent: "center", fontSize: 13, color: T.textLow }}>
          <span>
            {result.challengerName}: <strong style={{ color: T.text }}>{result.challengerScore}</strong>
          </span>
          <span style={{ color: "rgba(255,255,255,.15)" }}>·</span>
          <span>
            {result.opponentName}: <strong style={{ color: T.text }}>{result.opponentScore}</strong>
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}