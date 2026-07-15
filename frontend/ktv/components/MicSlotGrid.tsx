// ktv/components/MicSlotGrid.tsx
// Khung 6 ghế mic dạng FaceTime — responsive layout 2/4/6, camera chỉ hiện
// khi user đó đang giữ mic VÀ đã được duyệt bật camera (CameraOn=true).
// Chưa bật camera → hiển thị avatar lớn thay video, đúng tinh thần
// "Users CANNOT enable camera freely" trong spec.
//
// FIX: controls (camera/kick) trước đây ẩn/hiện bằng CSS thuần
// `div:hover > .mic-slot-controls` — selector này không đáng tin cậy (phụ
// thuộc thứ tự inject <style>, không hoạt động trên thiết bị cảm ứng, và
// là nguyên nhân khiến nút không bấm được dù isHost đúng). Đã đổi sang
// React state (onMouseEnter/onMouseLeave) — chắc chắn hoạt động độc lập
// với CSS injection.

"use client";

import { useMemo, useState } from "react";
import { ktvTheme as T, springTransition } from "../theme";
import type { MicSlotArray } from "@/types/websocket";

interface RemoteStreamEntry {
  userId: string;
  stream: MediaStream;
}

interface MicSlotGridProps {
  slots: MicSlotArray; // luôn 6 phần tử, null = ghế trống
  myUserId: string;
  isHost: boolean;
  localStream: MediaStream | null;
  remoteStreams: RemoteStreamEntry[];
  micRequestCount: number;
  onRequestMic: () => void;
  onKick: (userId: string) => void;
  onToggleMyCamera: (on: boolean) => void;
  myCameraOn: boolean;
}

// Avatar gradient ổn định theo userId (không đổi mỗi lần re-render)
function avatarGradient(id: string): string {
  const h1 = (id.charCodeAt(0) * 53) % 360;
  const h2 = (id.charCodeAt(id.length - 1 || 0) * 97) % 360;
  return `linear-gradient(145deg, hsl(${h1},38%,32%), hsl(${h2},42%,44%))`;
}

export default function MicSlotGrid({
  slots,
  myUserId,
  isHost,
  localStream,
  remoteStreams,
  micRequestCount,
  onRequestMic,
  onKick,
  onToggleMyCamera,
  myCameraOn,
}: MicSlotGridProps) {
  const occupiedCount = useMemo(() => slots.filter(Boolean).length, [slots]);

  // Số cột theo occupied count — 2/4/6 responsive như spec yêu cầu.
  // 0-1 người: 1 cột lớn (cảm giác rộng rãi, không trống trải)
  // 2 người: 2 cột
  // 3-4 người: 2 cột (2 hàng)
  // 5-6 người: 3 cột (2 hàng)
  const cols = occupiedCount <= 1 ? 1 : occupiedCount <= 2 ? 2 : occupiedCount <= 4 ? 2 : 3;

  const iAmOnMic = slots.some((s) => s?.userId === myUserId);
  const hasEmptySlot = slots.some((s) => s === null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: T.textLow,
          }}
        >
          Mic · {occupiedCount}/6
        </span>

        {micRequestCount > 0 && isHost && (
          <span
            style={{
              padding: "2px 9px",
              borderRadius: T.radiusPill,
              fontSize: 10,
              fontWeight: 600,
              background: T.keyLo,
              color: T.key,
              border: `1px solid ${T.keyLo}`,
            }}
          >
            {micRequestCount} đang chờ
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 10,
        }}
      >
        {slots.map((slot, i) => (
          <MicSlotCard
            key={i}
            slot={slot}
            index={i}
            myUserId={myUserId}
            isHost={isHost}
            stream={
              slot?.userId === myUserId
                ? localStream
                : remoteStreams.find((r) => r.userId === slot?.userId)?.stream ?? null
            }
            onKick={onKick}
            onToggleMyCamera={onToggleMyCamera}
            myCameraOn={myCameraOn}
          />
        ))}
      </div>

      {!iAmOnMic && hasEmptySlot && (
        <button
          onClick={onRequestMic}
          style={{
            padding: "11px 0",
            borderRadius: T.radiusCardSm,
            border: `1px solid ${T.border}`,
            background: "rgba(255,255,255,.04)",
            color: T.text,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: springTransition,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.08)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.04)")}
        >
          🎤 Xin lên mic
        </button>
      )}

      {!iAmOnMic && !hasEmptySlot && (
        <div style={{ textAlign: "center", fontSize: 12, color: T.textLow, padding: "6px 0" }}>
          Đã đủ 6 ghế mic
        </div>
      )}
    </div>
  );
}

/* ─── Card cho từng ghế ─────────────────────────────────────────────────────── */

function MicSlotCard({
  slot,
  index,
  myUserId,
  isHost,
  stream,
  onKick,
  onToggleMyCamera,
  myCameraOn,
}: {
  slot: MicSlotArray[number];
  index: number;
  myUserId: string;
  isHost: boolean;
  stream: MediaStream | null;
  onKick: (userId: string) => void;
  onToggleMyCamera: (on: boolean) => void;
  myCameraOn: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  if (!slot) {
    return (
      <div
        style={{
          aspectRatio: "1",
          borderRadius: T.radiusCardSm,
          border: `1.5px dashed ${T.border}`,
          background: "rgba(255,255,255,.015)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `1.5px dashed ${T.textLow}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.textLow,
            fontSize: 16,
          }}
        >
          +
        </div>
      </div>
    );
  }

  const isMe = slot.userId === myUserId;
  const showVideo = slot.cameraOn && stream;
  // Trên desktop: chỉ hiện khi hover (giữ giao diện sạch). Trên
  // touch/mobile không có hover thật, nên luôn hiện nhẹ mờ để vẫn bấm được
  // — đổi opacity mặc định thay vì 0 tuyệt đối để không "biến mất" hẳn.
  const controlsVisible = hovered;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      style={{
        position: "relative",
        aspectRatio: "1",
        borderRadius: T.radiusCardSm,
        overflow: "hidden",
        background: showVideo ? "#000" : avatarGradient(slot.userId),
        border: `1px solid ${slot.isSpeaking ? "rgba(226,65,84,.5)" : T.border}`,
        boxShadow: slot.isSpeaking ? `0 0 0 3px ${T.keyGlow}, 0 0 24px ${T.keyGlow}` : "none",
        transition: springTransition,
      }}
    >
      {showVideo ? (
        <VideoTile stream={stream} muted={isMe} />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "44%",
              aspectRatio: "1",
              borderRadius: "50%",
              background: "rgba(255,255,255,.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28%",
              fontWeight: 600,
              color: "rgba(255,255,255,.85)",
            }}
          >
            {slot.userName[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
      )}

      {/* gradient scrim đáy để chữ luôn đọc được trên cả video lẫn avatar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "42%",
          background: "linear-gradient(to top, rgba(0,0,0,.55), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* tên + trạng thái */}
      <div
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textShadow: "0 1px 3px rgba(0,0,0,.4)",
          }}
        >
          {slot.userName}
        </span>
        {index === 0 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.65)" }}>👑</span>
        )}
      </div>

      {/* badge quà tặng — góc trên phải, chỉ hiện khi có điểm */}
      {slot.giftScore > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "2px 7px",
            borderRadius: T.radiusPill,
            background: "rgba(0,0,0,.4)",
            backdropFilter: "blur(8px)",
            fontSize: 10,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          🎁 {slot.giftScore}
        </div>
      )}

      {/* icon camera-off nhỏ khi chưa bật cam, góc trên trái */}
      {!slot.cameraOn && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "rgba(0,0,0,.4)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
          }}
        >
          📷
        </div>
      )}

      {/* controls — chỉ hiện khi hover/touch, chỉ cho chính mình hoặc host.
          Dùng React state (hovered) thay vì CSS hover selector — đảm bảo
          hoạt động đúng cho cả 2 trường hợp isMe và isHost, không phụ
          thuộc vào việc <style> có được inject/scope đúng hay không. */}
      {(isMe || isHost) && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: slot.giftScore > 0 ? 54 : 8,
            display: "flex",
            gap: 4,
            opacity: controlsVisible ? 1 : 0,
            pointerEvents: controlsVisible ? "auto" : "none",
            transition: "opacity .2s",
          }}
        >
          {isMe && (
            <button
              onClick={() => onToggleMyCamera(!myCameraOn)}
              title={myCameraOn ? "Tắt camera" : "Bật camera"}
              style={ctrlBtnStyle}
            >
              {myCameraOn ? "📹" : "📷"}
            </button>
          )}
          {(isMe || isHost) && (
            <button
              onClick={() => onKick(slot.userId)}
              title={isMe ? "Rời mic" : "Tắt mic"}
              style={ctrlBtnStyle}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ctrlBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "none",
  background: "rgba(0,0,0,.5)",
  backdropFilter: "blur(8px)",
  color: "#fff",
  fontSize: 11,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

/* ─── Video tile — gắn MediaStream vào <video> qua ref callback ─────────────── */

function VideoTile({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  return (
    <video
      autoPlay
      playsInline
      muted={muted}
      ref={(el) => {
        if (el && el.srcObject !== stream) el.srcObject = stream;
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: muted ? "scaleX(-1)" : "none", // mirror camera của chính mình, giống FaceTime
      }}
    />
  );
}