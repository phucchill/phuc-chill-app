"use client";

import { useRef, useState } from "react";

interface SliderProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  /** Gọi khi người dùng NHẢ chuột/ngón tay — dùng để bắn socket (seek), tránh spam khi đang kéo */
  onChangeCommit?: (value: number) => void;
  disabled?: boolean;
  /** "progress" to hơn 1 chút, "volume" mảnh hơn — mặc định "progress" */
  variant?: "progress" | "volume";
  ariaLabel?: string;
}

/**
 * Slider tự vẽ (không dùng <input type=range> mặc định của trình duyệt) để
 * đạt đúng phong cách Apple Music: track mỏng, thumb tròn nhỏ chỉ hiện khi
 * hover/kéo, fill theo màu chủ đạo. Dùng chung cho Progress bar và Volume.
 *
 * LƯU Ý QUAN TRỌNG: vùng có thể bấm/kéo (hit-area) LUÔN cao tối thiểu 16px
 * — KHÔNG bằng độ dày hiển thị của track (trackHeight, có thể chỉ 3px cho
 * volume). Bản trước để hit-area = trackHeight khiến thanh volume gần như
 * không thể bấm trúng (vùng bấm chỉ cao 3px), đây là chỗ đã sửa.
 */
export default function Slider({
  value,
  min = 0,
  max,
  onChange,
  onChangeCommit,
  disabled,
  variant = "progress",
  ariaLabel,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const safeMax = max > min ? max : min + 1;
  const percent = Math.min(100, Math.max(0, ((value - min) / (safeMax - min)) * 100));

  const valueFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + ratio * (safeMax - min);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    trackRef.current?.setPointerCapture(e.pointerId);
    setIsDragging(true);
    onChange(valueFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled) return;
    onChange(valueFromClientX(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    onChangeCommit?.(valueFromClientX(e.clientX));
  };

  const trackHeight = variant === "progress" ? "h-1" : "h-[3px]";
  const showThumb = isHovering || isDragging;

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      aria-valuemin={min}
      aria-valuemax={safeMax}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={(e) => {
        // Nhả kéo nếu con trỏ rời khỏi cửa sổ trong lúc đang giữ — tránh
        // kẹt trạng thái isDragging nếu pointerup xảy ra ngoài phần tử.
        if (isDragging && e.buttons === 0) {
          setIsDragging(false);
        }
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`group relative flex w-full items-center py-2 ${
        disabled ? "cursor-default" : "cursor-pointer touch-none"
      }`}
      style={{ minHeight: 16 }}
    >
      {/* Track nền */}
      <div className={`pointer-events-none absolute inset-x-0 ${trackHeight} rounded-full bg-white/15`} />

      {/* Fill */}
      <div
        className={`pointer-events-none absolute left-0 ${trackHeight} rounded-full bg-key`}
        style={{ width: `${percent}%`, transition: isDragging ? "none" : "width 0.15s linear" }}
      />

      {/* Thumb — chỉ hiện khi hover/kéo, đúng phong cách Apple */}
      <div
        className={`pointer-events-none absolute h-3 w-3 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-opacity duration-150 ${
          showThumb && !disabled ? "opacity-100" : "opacity-0"
        }`}
        style={{ left: `calc(${percent}% - 6px)` }}
      />
    </div>
  );
}