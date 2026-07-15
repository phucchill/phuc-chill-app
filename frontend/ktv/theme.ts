// ktv/theme.ts
// Design tokens cho KTV Room mới — PHẢI khớp với theme của Music Room hiện có
// (--color-key, --color-surface, --color-background trong globals.css) để cả
// 2 khu vực cảm giác thuộc cùng 1 app. Không dùng theme tím/hồng cũ của KTV nữa.

export const ktvTheme = {
  // ── Base (khớp Apple Music dark) ──
  background: "#1f1f1f",
  surface: "#252525",
  surfaceHi: "#2c2c2c",
  surfaceLo: "#1a1a1a",

  // ── Accent — CHỈ dùng cho progress bar, nút Play, trạng thái "live/speaking" ──
  key: "#e24154",
  keyLo: "rgba(226,65,84,.14)",
  keyGlow: "rgba(226,65,84,.45)",

  // ── Border / separator ──
  border: "rgba(255,255,255,.08)",
  borderHi: "rgba(255,255,255,.14)",

  // ── Text ──
  text: "rgba(255,255,255,.92)",
  textMid: "rgba(255,255,255,.52)",
  textLow: "rgba(255,255,255,.28)",

  // ── Trạng thái (giữ tối giản, không RGB rực) ──
  success: "#30d158",
  successLo: "rgba(48,209,88,.14)",
  warning: "#e2b341",
  warningLo: "rgba(226,179,65,.14)",
  danger: "#e24154", // dùng chung key color, không thêm màu đỏ khác

  // ── Bán kính bo góc ──
  radiusCard: 20,
  radiusCardSm: 16,
  radiusPill: 999,

  // ── Font ──
  font: `-apple-system, "SF Pro Display", "SF Pro Text", "Inter", sans-serif`,
} as const;

// ── Glassmorphism helper — dùng thống nhất mọi nơi thay vì lặp lại inline ──
export function glass(alpha = 0.06): React.CSSProperties {
  return {
    background: `rgba(255,255,255,${alpha})`,
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
  };
}

// ── Transition chuẩn Apple: spring nhẹ, không bounce/flash ──
export const springTransition = "all .35s cubic-bezier(.25,.1,.25,1)";
export const fadeTransition = "opacity .3s ease, transform .3s ease";

// ── Audience status — dùng chung giữa MicSlotGrid, LoungeMode, SocialPanel ──
export type AudienceStatus =
  | "listening"
  | "chatting"
  | "waiting"
  | "on_mic"
  | "camera_on"
  | "singing";

export const audienceStatusMeta: Record<AudienceStatus, { icon: string; label: string }> = {
  listening: { icon: "🎧", label: "Đang nghe" },
  chatting: { icon: "💬", label: "Đang chat" },
  waiting: { icon: "🎤", label: "Đang chờ mic" },
  on_mic: { icon: "🎙", label: "Đang giữ mic" },
  camera_on: { icon: "📹", label: "Camera bật" },
  singing: { icon: "🎵", label: "Đang hát" },
};

// ── Gift catalog — giữ nguyên giá trị khớp model.GiftCost bên Go ──
export const GIFTS = [
  { type: "rose", emoji: "🌹", name: "Hoa hồng", cost: 10 },
  { type: "heart", emoji: "💖", name: "Trái tim", cost: 20 },
  { type: "crown", emoji: "👑", name: "Vương miện", cost: 50 },
  { type: "diamond", emoji: "💎", name: "Kim cương", cost: 100 },
  { type: "rocket", emoji: "🚀", name: "Tên lửa", cost: 200 },
  { type: "trophy", emoji: "🏆", name: "Cúp vàng", cost: 500 },
] as const;

export const MAX_MIC_SLOTS = 6;