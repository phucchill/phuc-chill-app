// ktv/components/RoomMemoryPanel.tsx
// Hiển thị roomState.roomMemory (lịch sử trình diễn trong phiên phòng) và
// roomState.topSingers (bảng vinh danh trong phòng). CHỈ trong phạm vi
// phòng hiện tại — reset khi phòng đóng, KHÔNG persist Mongo (đúng model
// RoomMemoryEntry/TopSingerStats bên Go, xem ktv.go).
//
// Component THUẦN PRESENTATIONAL, nhận dữ liệu trực tiếp từ roomState —
// không tự tính toán top singer (server đã tính qua GetTopSingers()).

"use client";

import { useState } from "react";
import { ktvTheme as T, springTransition } from "../theme";
import type { RoomMemoryEntry, TopSingerStats } from "@/types/websocket";

export interface RoomMemoryPanelProps {
  roomMemory: RoomMemoryEntry[];
  topSingers: TopSingerStats[];
  onClose?: () => void; // nếu dùng dạng modal/drawer, để trống nếu nhúng cố định
}

type Tab = "history" | "top";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtTimeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  return `${Math.floor(diffSec / 3600)} giờ trước`;
}

function avatarGradient(id: string): string {
  const h1 = (id.charCodeAt(0) * 53) % 360;
  const h2 = (id.charCodeAt(id.length - 1 || 0) * 97) % 360;
  return `linear-gradient(145deg, hsl(${h1},38%,32%), hsl(${h2},42%,44%))`;
}

// Danh mục thành tích để bảng vinh danh có nhiều "chức danh" chứ không chỉ
// 1 bảng xếp hạng chung — đúng tinh thần "hát nhiều nhất / nhiều quà nhất /
// nhiều likes nhất / thắng PK nhiều nhất" trong đề bài.
type Category = { key: keyof TopSingerStats; label: string; icon: string };
const CATEGORIES: Category[] = [
  { key: "songsSung", label: "Hát nhiều nhất", icon: "🎤" },
  { key: "totalGifts", label: "Nhận quà nhiều nhất", icon: "🎁" },
  { key: "totalLikes", label: "Nhiều likes nhất", icon: "❤️" },
  { key: "pkWins", label: "Thắng PK nhiều nhất", icon: "🏆" },
];

export default function RoomMemoryPanel({ roomMemory, topSingers, onClose }: RoomMemoryPanelProps) {
  const [tab, setTab] = useState<Tab>("history");

  // Lịch sử — mới nhất lên đầu (server append vào cuối mảng khi trình diễn kết thúc)
  const historyDesc = [...roomMemory].reverse();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: T.font,
        color: T.text,
        background: T.background,
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="Lịch sử phòng" />
          <TabButton active={tab === "top"} onClick={() => setTab("top")} label="Vinh danh" />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: T.textLow, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>

      {/* note nhỏ nhắc rõ phạm vi — tránh người dùng hiểu nhầm là bảng xếp hạng toàn cục */}
      <div
        style={{
          padding: "8px 18px",
          fontSize: 11,
          color: T.textLow,
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}
      >
        📌 Chỉ tính trong phòng này · sẽ mất khi phòng đóng
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {tab === "history" ? <HistoryList entries={historyDesc} /> : <TopSingerBoard singers={topSingers} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: T.radiusPill,
        border: `1px solid ${active ? "rgba(226,65,84,.35)" : "transparent"}`,
        background: active ? T.keyLo : "transparent",
        color: active ? T.key : T.textLow,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: T.font,
        transition: springTransition,
      }}
    >
      {label}
    </button>
  );
}

/* ─── Lịch sử trình diễn ─────────────────────────────────────────────────────── */
function HistoryList({ entries }: { entries: RoomMemoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState icon="📀" text="Chưa có ai hát xong trong phòng này" />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((entry, i) => (
        <div
          key={`${entry.timestamp}-${i}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 14px",
            borderRadius: T.radiusCardSm,
            border: `1px solid ${T.border}`,
            background: "rgba(255,255,255,.025)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              flexShrink: 0,
              background: avatarGradient(entry.singerId),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {entry.singerName[0]?.toUpperCase() ?? "?"}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.songTitle}
            </div>
            <div style={{ fontSize: 11, color: T.textLow, marginTop: 1 }}>
              {entry.singerName} · {entry.songArtist || "Unknown"} · {fmtDuration(entry.durationSec)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: T.textMid }}>
              <span>❤️ {entry.likes}</span>
              <span>🎁 {entry.giftScore}</span>
              <span>👥 {entry.audienceCount}</span>
            </div>
            <span style={{ fontSize: 10, color: T.textLow }}>{fmtTimeAgo(entry.timestamp)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Bảng vinh danh (4 hạng mục) ────────────────────────────────────────────── */
function TopSingerBoard({ singers }: { singers: TopSingerStats[] }) {
  if (singers.length === 0) {
    return <EmptyState icon="🏆" text="Chưa có ai lên bảng vinh danh" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {CATEGORIES.map((cat) => {
        const ranked = [...singers]
          .filter((s) => (s[cat.key] as number) > 0)
          .sort((a, b) => (b[cat.key] as number) - (a[cat.key] as number))
          .slice(0, 3);

        if (ranked.length === 0) return null;

        return (
          <div key={cat.key}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: T.textLow,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {cat.icon} {cat.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ranked.map((s, i) => (
                <div
                  key={s.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 12,
                    background: i === 0 ? T.keyLo : "rgba(255,255,255,.025)",
                    border: `1px solid ${i === 0 ? "rgba(226,65,84,.3)" : T.border}`,
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: i === 0 ? T.key : T.textLow,
                      flexShrink: 0,
                    }}
                  >
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </span>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: avatarGradient(s.userId),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {s.userName[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.userName}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? T.key : T.textMid, flexShrink: 0 }}>
                    {s[cat.key] as number}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 8,
        opacity: 0.25,
        minHeight: 200,
      }}
    >
      <div style={{ fontSize: 30 }}>{icon}</div>
      <div style={{ fontSize: 12 }}>{text}</div>
    </div>
  );
}