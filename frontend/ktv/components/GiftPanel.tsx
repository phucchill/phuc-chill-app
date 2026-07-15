// ktv/components/GiftPanel.tsx
// Bảng chọn quà — tách ra từ logic đã lặp lại ở LoungeMode/PerformanceMode.
// Giữ NGUYÊN nghiệp vụ gửi GIFT_SEND (payload y hệt bản cũ), chỉ đổi theme
// theo ktv/theme.ts. Thiết kế để cắm vào `giftSlot` của SocialPanel.tsx —
// SocialPanel chỉ lo nút toggle 🎁, GiftPanel lo toàn bộ UI bên trong.
//
// Component THUẦN PRESENTATIONAL — không tự gọi sendWS, chỉ gọi onSendGift
// do orchestrator (page.tsx) truyền xuống.

"use client";

import { useState } from "react";
import { ktvTheme as T, springTransition, GIFTS } from "../theme";
import type { Participant } from "@/types/websocket";

interface GiftOption {
  type: string;
  emoji: string;
  name: string;
  cost: number;
}

export interface GiftPanelProps {
  participants: Participant[];
  myUserId: string;
  onSendGift: (toUserId: string, toUserName: string, gift: GiftOption) => void;
  onClose: () => void;

  /** Người nhận mặc định được chọn sẵn khi mở panel (vd: ca sĩ đang spotlight) */
  defaultTargetId?: string;

  /** Đánh dấu badge đặc biệt cạnh tên (vd: 🎤 cho ca sĩ đang hát) */
  targetBadges?: Record<string, string>;
}

export default function GiftPanel({
  participants,
  myUserId,
  onSendGift,
  onClose,
  defaultTargetId,
  targetBadges,
}: GiftPanelProps) {
  const [target, setTarget] = useState(defaultTargetId ?? "");

  const recipients = participants.filter((p) => p.id !== myUserId);
  const targetUser = participants.find((p) => p.id === target);

  const handleSend = (gift: (typeof GIFTS)[number]) => {
    if (!targetUser) return;
    onSendGift(targetUser.id, targetUser.name, gift);
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${T.border}`,
        background: "rgba(0,0,0,.3)",
        flexShrink: 0,
        fontFamily: T.font,
        animation: "giftPanelSlideUp .22s ease",
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "12px 16px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Tặng quà</span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: T.textLow,
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* chọn người nhận */}
      <div style={{ padding: "0 16px 8px", display: "flex", flexWrap: "wrap", gap: 5 }}>
        {recipients.length === 0 ? (
          <span style={{ fontSize: 12, color: T.textLow }}>Chưa có ai khác trong phòng</span>
        ) : (
          recipients.map((p) => {
            const isSelected = target === p.id;
            const badge = targetBadges?.[p.id] ?? (p.isHost ? "👑" : "");
            return (
              <button
                key={p.id}
                onClick={() => setTarget(p.id)}
                style={{
                  padding: "4px 11px",
                  borderRadius: T.radiusPill,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  border: `1px solid ${isSelected ? "rgba(226,65,84,.5)" : T.border}`,
                  background: isSelected ? T.keyLo : "rgba(255,255,255,.04)",
                  color: isSelected ? T.key : T.textMid,
                  transition: springTransition,
                  fontFamily: T.font,
                }}
              >
                {p.name}
                {badge ? ` ${badge}` : ""}
              </button>
            );
          })
        )}
      </div>

      {/* lưới quà */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, padding: "0 16px 14px" }}>
        {GIFTS.map((g) => (
          <button
            key={g.type}
            disabled={!targetUser}
            onClick={() => handleSend(g)}
            style={{
              padding: "10px 4px",
              borderRadius: 12,
              cursor: targetUser ? "pointer" : "not-allowed",
              border: `1px solid ${T.border}`,
              background: "rgba(255,255,255,.04)",
              textAlign: "center",
              opacity: targetUser ? 1 : 0.4,
              transition: springTransition,
              fontFamily: T.font,
            }}
            onMouseEnter={(e) => {
              if (targetUser) (e.currentTarget as HTMLElement).style.background = T.keyLo;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)";
            }}
          >
            <div style={{ fontSize: 22 }}>{g.emoji}</div>
            <div style={{ fontSize: 11, color: T.textMid, marginTop: 2, fontWeight: 500 }}>{g.name}</div>
            <div style={{ fontSize: 10, color: T.textLow }}>{g.cost}xu</div>
          </button>
        ))}
      </div>

      {!targetUser && recipients.length > 0 && (
        <div style={{ textAlign: "center", fontSize: 11, color: T.textLow, paddingBottom: 10 }}>
          Chọn người nhận trước
        </div>
      )}

      <style>{`
        @keyframes giftPanelSlideUp {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
}