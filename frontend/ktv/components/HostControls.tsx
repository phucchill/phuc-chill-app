// ktv/components/HostControls.tsx
// Menu quyền host — CHỈ render khi isHost=true (page.tsx tự kiểm tra trước
// khi mount component này, nhưng vẫn double-check ở đây cho an toàn).
// Gom các hành động rải rác đã có sẵn logic ở backend nhưng CHƯA có 1 nơi
// tập trung ở FE: duyệt/từ chối mic, spotlight ca sĩ, quản lý hàng đợi bài,
// quản lý playback, kick user, bắt đầu/kết thúc PK.
//
// Component THUẦN PRESENTATIONAL — mọi action đều gọi callback do
// orchestrator (page.tsx) cung cấp, khớp đúng message type đã có ở
// ktv_handler.go (không tạo message type mới nào).

"use client";

import { useState } from "react";
import { ktvTheme as T, springTransition } from "../theme";
import type { Participant, MicSlotArray, MicRequest, SongQueueItem, RoomMode } from "@/types/websocket";

export interface HostControlsProps {
  isHost: boolean;
  mode: RoomMode;

  // ── Mic requests (hàng chờ) ──
  micRequests: MicRequest[];
  onApproveMic: (userId: string, userName: string) => void;
  onRejectMic: (userId: string) => void;

  // ── Mic slots đang giữ (để host gỡ / spotlight) ──
  micSlots: MicSlotArray;
  onKickMic: (userId: string) => void;
  onSpotlight: (singerId: string, singerName: string, songTitle: string, songArtist: string, lyrics?: string, albumCoverUrl?: string) => void;  
  // ── Song queue ──
  queue: SongQueueItem[];
  onRemoveSong: (id: string) => void;
  onNextSong: () => void;

  // ── Playback ──
  isPlaying: boolean;
  onPlayToggle: () => void;

  // ── Participants / kick khỏi phòng ──
  participants: Participant[];
  onKickFromRoom?: (userId: string) => void; // optional — backend hiện chưa có message KICK_FROM_ROOM riêng (xem ghi chú cuối file)

  // ── PK ──
  onStartPK: (opponentId: string, opponentName: string) => void;
  onEndPK: () => void;
  pkActive: boolean;
}

type SectionKey = "mic_requests" | "mic_slots" | "queue" | "playback" | "pk" | "members";
export default function HostControls({
  isHost,
  mode,
  micRequests,
  onApproveMic,
  onRejectMic,
  micSlots,
  onKickMic,
  onSpotlight,
  queue,
  onRemoveSong,
  onNextSong,
  isPlaying,
  onPlayToggle,
  participants,
  onKickFromRoom,
  onStartPK,
  onEndPK,
  pkActive,
}: HostControlsProps) {
  const [expanded, setExpanded] = useState<SectionKey | null>("mic_requests");
const [spotlightForm, setSpotlightForm] = useState<{ userId: string; songTitle: string; songArtist: string; lyrics: string; albumCoverUrl: string } | null>(null);
  if (!isHost) return null; // double-check — page.tsx đã kiểm tra trước khi mount

  const occupiedSlots = micSlots.filter(Boolean);
  const toggle = (key: SectionKey) => setExpanded((cur) => (cur === key ? null : key));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: T.font,
        color: T.text,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: T.key,
          padding: "0 2px",
        }}
      >
        👑 Quyền host
      </div>

      {/* ── Mic requests ── */}
      <Section
        title="Yêu cầu mic"
        badge={micRequests.length}
        expanded={expanded === "mic_requests"}
        onToggle={() => toggle("mic_requests")}
      >
        {micRequests.length === 0 ? (
          <EmptyRow text="Không có yêu cầu nào" />
        ) : (
          micRequests.map((r) => (
            <div key={r.userId} style={rowStyle}>
              <span style={rowNameStyle}>{r.userName}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <SmallButton label="✓ Duyệt" tone="success" onClick={() => onApproveMic(r.userId, r.userName)} />
                <SmallButton label="✗" tone="danger" onClick={() => onRejectMic(r.userId)} />
              </div>
            </div>
          ))
        )}
      </Section>

      {/* ── Mic slots đang giữ — gỡ mic / spotlight ── */}
      <Section
        title="Ghế mic đang giữ"
        badge={occupiedSlots.length}
        expanded={expanded === "mic_slots"}
        onToggle={() => toggle("mic_slots")}
      >
        {occupiedSlots.length === 0 ? (
          <EmptyRow text="Chưa ai giữ mic" />
        ) : (
          occupiedSlots.map((s) => (
            <div key={s!.userId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={rowStyle}>
                <span style={rowNameStyle}>
                  {s!.userName} {s!.cameraOn && "📹"}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {mode !== "performance" && (
                    <SmallButton
                      label="🎤 Spotlight"
                      tone="key"
onClick={() => setSpotlightForm({ userId: s!.userId, songTitle: "", songArtist: "", lyrics: "", albumCoverUrl: "" })}                    />
                  )}
                  <SmallButton label="Gỡ mic" tone="danger" onClick={() => onKickMic(s!.userId)} />
                </div>
              </div>

              {spotlightForm?.userId === s!.userId && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px", borderRadius: 10, background: "rgba(255,255,255,.03)", border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input placeholder="Tên bài hát" value={spotlightForm.songTitle}
                      onChange={(e) => setSpotlightForm({ ...spotlightForm, songTitle: e.target.value })}
                      style={miniInputStyle} />
                    <input placeholder="Nghệ sĩ" value={spotlightForm.songArtist}
                      onChange={(e) => setSpotlightForm({ ...spotlightForm, songArtist: e.target.value })}
                      style={{ ...miniInputStyle, maxWidth: 90 }} />
                  </div>
                  <input placeholder="Link ảnh bìa album (tùy chọn)" value={spotlightForm.albumCoverUrl}
                    onChange={(e) => setSpotlightForm({ ...spotlightForm, albumCoverUrl: e.target.value })}
                    style={miniInputStyle} />
                  <textarea placeholder="Lời bài hát (tùy chọn, mỗi dòng 1 câu)" value={spotlightForm.lyrics}
                    onChange={(e) => setSpotlightForm({ ...spotlightForm, lyrics: e.target.value })}
                    rows={3}
                    style={{ ...miniInputStyle, resize: "vertical", fontFamily: T.font }} />
                  <SmallButton label="Bắt đầu" tone="key" full
                    onClick={() => {
                      onSpotlight(
                        s!.userId, s!.userName,
                        spotlightForm.songTitle || "Chưa rõ tên bài", spotlightForm.songArtist,
                        spotlightForm.lyrics || undefined, spotlightForm.albumCoverUrl || undefined
                      );
                      setSpotlightForm(null);
                    }} />
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      {/* ── Song queue ── */}
      <Section title="Hàng đợi bài hát" badge={queue.length} expanded={expanded === "queue"} onToggle={() => toggle("queue")}>
        {queue.length === 0 ? (
          <EmptyRow text="Hàng đợi trống" />
        ) : (
          <>
            <SmallButton label="⏭ Phát bài tiếp theo" tone="key" full onClick={onNextSong} />
            {queue.map((s) => (
              <div key={s.id} style={rowStyle}>
                <span style={rowNameStyle}>
                  {s.title} <span style={{ color: T.textLow }}>· {s.requestedByName}</span>
                </span>
                <SmallButton label="Xóa" tone="danger" onClick={() => onRemoveSong(s.id)} />
              </div>
            ))}
          </>
        )}
      </Section>

      {/* ── Playback ── */}
      <Section title="Phát nhạc nền" expanded={expanded === "playback"} onToggle={() => toggle("playback")}>
        <SmallButton label={isPlaying ? "⏸ Tạm dừng" : "▶ Phát"} tone="key" full onClick={onPlayToggle} />
      </Section>

      {/* ── PK ── */}
      <Section title="PK Battle" expanded={expanded === "pk"} onToggle={() => toggle("pk")}>
        {pkActive ? (
          <SmallButton label="Kết thúc PK ngay" tone="danger" full onClick={onEndPK} />
        ) : occupiedSlots.length < 2 ? (
          <EmptyRow text="Cần ít nhất 2 người đang giữ mic để thách đấu" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: T.textLow }}>Chọn 2 người để bắt đầu (người đầu là người bạn chọn trước):</span>
            {occupiedSlots.map((s) => (
              <SmallButton
                key={s!.userId}
                label={`⚔️ Thách đấu với ${s!.userName}`}
                tone="key"
                full
                onClick={() => onStartPK(s!.userId, s!.userName)}
              />
            ))}
          </div>
        )}
      </Section>
      {/* ── Thành viên — kick khỏi phòng hẳn ── */}
      <Section title="Thành viên trong phòng" badge={participants.filter((p) => !p.isHost).length} expanded={expanded === "members"} onToggle={() => toggle("members")}>
        {participants.filter((p) => !p.isHost).length === 0 ? (
          <EmptyRow text="Chỉ có mình bạn trong phòng" />
        ) : (
          participants.filter((p) => !p.isHost).map((p) => (
            <div key={p.id} style={rowStyle}>
              <span style={rowNameStyle}>{p.name}</span>
              <SmallButton label="Mời ra khỏi phòng" tone="danger" onClick={() => onKickFromRoom?.(p.id)} />
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

/* ─── Collapsible section ────────────────────────────────────────────────────── */
function Section({
  title,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  badge?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: T.radiusCardSm,
        border: `1px solid ${T.border}`,
        background: "rgba(255,255,255,.02)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: T.text,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: T.font,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {title}
          {!!badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 7px",
                borderRadius: T.radiusPill,
                background: T.keyLo,
                color: T.key,
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10, transition: springTransition, transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      )}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: T.textLow, padding: "4px 2px" }}>{text}</div>;
}

function SmallButton({
  label,
  tone,
  onClick,
  full,
}: {
  label: string;
  tone: "success" | "danger" | "key";
  onClick: () => void;
  full?: boolean;
}) {
  const colors = {
    success: { bg: T.successLo, fg: T.success, border: "rgba(48,209,88,.3)" },
    danger: { bg: "rgba(226,65,84,.1)", fg: T.danger, border: "rgba(226,65,84,.3)" },
    key: { bg: T.keyLo, fg: T.key, border: "rgba(226,65,84,.3)" },
  }[tone];

  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: T.font,
        flex: full ? 1 : undefined,
        whiteSpace: "nowrap",
        transition: springTransition,
      }}
    >
      {label}
    </button>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "6px 2px",
};

const rowNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};

const miniInputStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,.06)",
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "5px 8px",
  color: T.text,
  fontSize: 11,
  outline: "none",
  fontFamily: T.font,
  minWidth: 0,
};
