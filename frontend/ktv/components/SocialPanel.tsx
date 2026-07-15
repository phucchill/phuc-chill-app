// ktv/components/SocialPanel.tsx
// Panel bên phải dùng CHUNG cho LoungeMode và PerformanceMode: chat +
// activity feed (tab) + reaction quick-buttons + slot cắm GiftPanel (bước 5).
// Component THUẦN PRESENTATIONAL — không tự mở WebSocket, không tự suy luận
// activity events (orchestrator gom từ các WS message rồi truyền xuống qua
// `activityItems`, xem gợi ý cách gom ở cuối file).
//
// LƯU Ý: LoungeMode.tsx và PerformanceMode.tsx hiện đang TỰ CHỨA logic chat
// giống hệt nội dung file này. Khi bạn đồng ý, tôi sẽ gửi lại 2 file đó ở
// dạng rút gọn, import SocialPanel thay vì lặp code — báo tôi khi muốn làm.

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ktvTheme as T, springTransition } from "../theme";
import type { ChatMessage } from "@/types/websocket";

export interface ActivityItem {
  id: string;
  icon: string; // vd "🎤", "🎁", "⚔️", "👋"
  text: string; // vd "Lan đã được duyệt lên mic"
  timestamp: number;
}

export interface SocialPanelProps {
  // ── Chat ──
  messages: ChatMessage[];
  isLoadingChat: boolean;
  onSendChat: (content: string) => void;
  connected: boolean;

  // ── Activity feed ──
  activityItems: ActivityItem[];

  // ── Reaction quick-buttons ──
  onSendReaction?: (emoji: string) => void;

  // ── Gift — SocialPanel chỉ render nút toggle, UI chọn quà là slot con ──
  giftOpen: boolean;
  onToggleGift: () => void;
  giftSlot?: React.ReactNode;

  // ── Tuỳ biến nhỏ theo mode gọi nó (Lounge rộng hơn Performance) ──
  width?: number;
}

const REACTION_EMOJIS = ["🔥", "😍", "👏", "😂", "❤️"];

export default function SocialPanel({
  messages,
  isLoadingChat,
  onSendChat,
  connected,
  activityItems,
  onSendReaction,
  giftOpen,
  onToggleGift,
  giftSlot,
  width = 320,
}: SocialPanelProps) {
  const [chatText, setChatText] = useState("");
  const [tab, setTab] = useState<"chat" | "activity">("chat");

  const sendChat = () => {
    if (!chatText.trim()) return;
    onSendChat(chatText);
    setChatText("");
  };

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${T.border}`,
        background: "rgba(0,0,0,.12)",
        fontFamily: T.font,
        color: T.text,
      }}
    >
      {/* ── header: tab switcher ── */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")} label="Chat" />
          <TabButton
            active={tab === "activity"}
            onClick={() => setTab("activity")}
            label="Hoạt động"
            badge={activityItems.length > 0 ? activityItems.length : undefined}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {connected && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: T.key,
                boxShadow: `0 0 6px ${T.keyGlow}`,
              }}
            />
          )}
        </div>
      </div>

      {/* ── body: chat hoặc activity ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", minHeight: 0 }}>
        {tab === "chat" ? (
          <ChatList messages={messages} isLoading={isLoadingChat} />
        ) : (
          <ActivityList items={activityItems} />
        )}
      </div>

      {/* ── gift slot (bước 5 cắm GiftPanel vào đây) ── */}
      {giftOpen && giftSlot}

      {/* ── reaction row + input (luôn hiện, không phụ thuộc tab) ── */}
      <div style={{ padding: "10px 14px 12px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
          <button
            onClick={onToggleGift}
            title="Tặng quà"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: `1px solid ${giftOpen ? "rgba(226,65,84,.4)" : T.border}`,
              cursor: "pointer",
              background: giftOpen ? T.keyLo : "rgba(255,255,255,.05)",
              color: "#fff",
              fontSize: 17,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: springTransition,
              flexShrink: 0,
            }}
          >
            🎁
          </button>

          {onSendReaction &&
            REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSendReaction(emoji)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: `1px solid ${T.border}`,
                  background: "rgba(255,255,255,.04)",
                  cursor: "pointer",
                  fontSize: 14,
                  flexShrink: 0,
                  transition: springTransition,
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.09)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)")}
              >
                {emoji}
              </button>
            ))}
        </div>

        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Nhắn gì đó..."
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendChat();
            }}
            style={{
              flex: 1,
              background: "rgba(255,255,255,.06)",
              border: `1px solid ${T.border}`,
              borderRadius: T.radiusPill,
              padding: "9px 16px",
              color: T.text,
              fontSize: 13,
              outline: "none",
              fontFamily: T.font,
              transition: "border-color .15s",
            }}
            onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "rgba(226,65,84,.4)")}
            onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = T.border)}
          />
          <button
            onClick={sendChat}
            disabled={!chatText.trim()}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: "none",
              flexShrink: 0,
              cursor: chatText.trim() ? "pointer" : "not-allowed",
              background: chatText.trim() ? T.key : "rgba(255,255,255,.06)",
              color: "white",
              opacity: chatText.trim() ? 1 : 0.4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              transition: springTransition,
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ─── Tab button ─────────────────────────────────────────────────────────────── */
function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: T.radiusPill,
        border: `1px solid ${active ? "rgba(226,65,84,.35)" : "transparent"}`,
        background: active ? T.keyLo : "transparent",
        color: active ? T.key : T.textLow,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: T.font,
        display: "flex",
        alignItems: "center",
        gap: 5,
        transition: springTransition,
      }}
    >
      {label}
      {!!badge && (
        <span
          style={{
            fontSize: 10,
            padding: "0 5px",
            borderRadius: T.radiusPill,
            background: active ? "rgba(226,65,84,.25)" : "rgba(255,255,255,.1)",
            color: active ? T.key : T.textMid,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ─── Chat list ──────────────────────────────────────────────────────────────── */
function ChatList({ messages, isLoading }: { messages: ChatMessage[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3, fontSize: 12 }}>
        Đang tải chat...
      </div>
    );
  }
  if (messages.length === 0) {
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
        }}
      >
        <div style={{ fontSize: 26 }}>💬</div>
        <div style={{ fontSize: 12 }}>Chưa có tin nhắn</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((m, i) => (
        <div
          key={m.id ?? m._id ?? i}
          style={{ display: "flex", flexDirection: "column", alignItems: m.isMine ? "flex-end" : "flex-start" }}
        >
          <span
            style={{
              fontSize: 10,
              marginBottom: 3,
              fontWeight: 500,
              color: m.isMine ? T.key : T.textMid,
              paddingLeft: m.isMine ? 0 : 3,
              paddingRight: m.isMine ? 3 : 0,
            }}
          >
            {m.isMine ? "Bạn" : m.userName}
          </span>
          <div
            style={{
              maxWidth: "84%",
              padding: "8px 13px",
              borderRadius: m.isMine ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
              background: m.isMine ? T.key : "rgba(255,255,255,.06)",
              border: `1px solid ${m.isMine ? "transparent" : T.border}`,
              fontSize: 13,
              color: "#fff",
              lineHeight: 1.55,
              wordBreak: "break-word",
            }}
          >
            {m.content}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Activity feed ──────────────────────────────────────────────────────────── */
function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
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
        }}
      >
        <div style={{ fontSize: 26 }}>📋</div>
        <div style={{ fontSize: 12 }}>Chưa có hoạt động nào</div>
      </div>
    );
  }
  // Mới nhất lên đầu — orchestrator nên push item mới vào cuối mảng, ta tự đảo khi render.
  const sorted = [...items].reverse();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {sorted.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(255,255,255,.03)",
            border: `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ fontSize: 12, color: T.textMid, lineHeight: 1.4 }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Floating reactions — dùng chung cho Lounge (góc dưới-phải) và
   Performance (giữa sân khấu). Mode gọi component này với `origin` khác
   nhau; bản thân animation giữ nguyên fade + drift lên, không bounce. ──── */
export interface FloatingReactionEntry {
  id: string;
  emoji: string;
  size?: number;
}

export function FloatingReactions({
  items,
  style,
}: {
  items: FloatingReactionEntry[];
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "absolute", zIndex: 60, pointerEvents: "none", ...style }}>
      <AnimatePresence>
        {items.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 0, scale: 0.6, x: (Math.random() - 0.5) * 40 }}
            animate={{ opacity: [0, 1, 1, 0], y: -100, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.1, ease: "easeOut" }}
            style={{ position: "absolute", fontSize: r.size ?? 24 }}
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   GỢI Ý cho orchestrator (page.tsx, bước 8) — cách gom activityItems:
   Lắng nghe các message đã có sẵn và push vào 1 mảng ActivityItem[] (giữ tối
   đa ~50 item gần nhất, KHÔNG persist Mongo — giống Room Memory):

   - MIC_APPROVE      → { icon:"🎤", text:`${userName} đã lên mic` }
   - MIC_KICKED/RELEASE → { icon:"👋", text:`${userName} đã rời mic` }
   - GIFT_BROADCAST   → { icon: giftEmoji, text:`${fromUserName} tặng ${giftName} cho ${toUserName}` }
   - PERFORMANCE_START→ { icon:"🎵", text:`${singerName} bắt đầu hát ${songTitle}` }
   - PERFORMANCE_END  → { icon:"🏁", text:`${singerName} đã hát xong ${songTitle}` }
   - PK_CHALLENGE     → { icon:"⚔️", text:`${challengerName} thách đấu ${opponentName}` }
   - PK_RESULT        → { icon:"🏆", text:`${winnerName} thắng trận PK!` }
   - USER_JOINED/LEFT → { icon:"👋", text:`${userName} đã vào/rời phòng` }
───────────────────────────────────────────────────────────────────────────── */