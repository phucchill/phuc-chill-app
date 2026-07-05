"use client";

import { useState } from "react";

/**
 * Một bài hát trong danh sách chờ.
 * - "pending": thành viên vừa request, đang chờ host duyệt
 * - "queued": đã được duyệt, đang nằm trong hàng chờ phát
 *
 * Gợi ý: nên đưa type này vào types/websocket.ts để dùng chung
 * với payload thật từ WebSocket (ví dụ QUEUE_UPDATE, SONG_REQUESTED...).
 */
export interface QueueSong {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number; // giây
  status: "pending" | "queued";
  requestedBy?: string;
}

interface PlaylistQueueProps {
  songs: QueueSong[];
  isHost: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRemove?: (id: string) => void;
  onClearPending?: () => void;
}

export default function PlaylistQueue({
  songs,
  isHost,
  onApprove,
  onReject,
  onRemove,
  onClearPending,
}: PlaylistQueueProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const pendingCount = songs.filter((s) => s.status === "pending").length;

  const formatDuration = (s?: number) => {
    if (!s || isNaN(s)) return "--:--";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-[380px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#111113]">
      {/* Header (cố định, không scroll) */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-white/5 px-5 py-4">
        <span className="whitespace-nowrap font-serif text-[13px] uppercase tracking-[0.15em] text-white/40">
          Danh sách chờ
        </span>

        {songs.length > 0 && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-sans text-[11px] text-white/60">
            {songs.length}
          </span>
        )}

        <span className="ml-auto flex items-center gap-[5px] whitespace-nowrap font-sans text-[11px] text-white/25">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Chỉ host duyệt
        </span>
      </div>

      {/* Danh sách — vùng duy nhất được scroll, khung ngoài luôn giữ nguyên kích thước */}
      <div className="queueScroll flex min-h-0 flex-1 flex-col overflow-y-auto bg-black/20">
        {songs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center font-sans text-[13px] text-white/20">
            Chưa có bài hát nào trong danh sách chờ
          </div>
        ) : (
          songs.map((song, index) => {
            const isPending = song.status === "pending";
            const showRemove = !isPending && isHost && hoveredId === song.id;

            return (
              <div
                key={song.id}
                onMouseEnter={() => setHoveredId(song.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="flex flex-shrink-0 items-center gap-3 border-b border-white/[0.03] px-5 py-2.5"
              >
                {/* Tay kéo sắp xếp (chỉ mang tính trực quan) */}
                <span
                  className={`flex-shrink-0 text-sm text-white/15 ${
                    isHost ? "cursor-grab" : "cursor-default"
                  }`}
                >
                  ⠿
                </span>

                {/* Số thứ tự */}
                <span className="w-4 flex-shrink-0 font-sans text-xs text-white/25">
                  {index + 1}
                </span>

                {/* Ảnh bìa */}
                <div
                  className="h-9 w-9 flex-shrink-0 rounded-lg bg-[#1a1a1c] bg-cover bg-center"
                  style={song.thumbnail ? { backgroundImage: `url(${song.thumbnail})` } : undefined}
                />

                {/* Tên bài / ca sĩ */}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-sans text-[13px] font-medium text-white/90">
                    {song.title}
                  </p>
                  {song.artist && (
                    <p className="m-0 truncate font-sans text-[11px] text-white/35">
                      {song.artist}
                    </p>
                  )}
                </div>

                {/* Thời lượng */}
                <span className="flex-shrink-0 font-sans text-[11px] text-white/30">
                  {formatDuration(song.duration)}
                </span>

                {/* Hành động */}
                <div className="flex min-w-[50px] flex-shrink-0 items-center justify-end gap-1.5">
                  {isPending && isHost && (
                    <>
                      <button
                        onClick={() => onApprove?.(song.id)}
                        title="Duyệt"
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10"
                      >
                        ✔
                      </button>
                      <button
                        onClick={() => onReject?.(song.id)}
                        title="Từ chối"
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/5 bg-transparent text-xs text-white/40 hover:bg-white/5"
                      >
                        ✖
                      </button>
                    </>
                  )}

                  {isPending && !isHost && (
                    <span className="font-sans text-[10px] italic text-white/40">Đang chờ</span>
                  )}

                  {!isPending &&
                    (showRemove ? (
                      <button
                        onClick={() => onRemove?.(song.id)}
                        title="Xóa khỏi danh sách chờ"
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/5 bg-transparent text-xs text-white/40 hover:bg-white/5"
                      >
                        ✖
                      </button>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 3" />
                      </svg>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Xóa hết yêu cầu chờ duyệt (cố định, không scroll) */}
      {isHost && pendingCount > 0 && (
        <button
          onClick={() => onClearPending?.()}
          className="m-3 flex-shrink-0 cursor-pointer rounded-[10px] border border-white/5 bg-white/[0.03] py-2.5 font-sans text-xs text-white/50 hover:bg-white/5"
        >
          🗑 Xóa hết yêu cầu chờ duyệt
        </button>
      )}

      <style>{`
        .queueScroll::-webkit-scrollbar {
          width: 6px;
        }
        .queueScroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .queueScroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 999px;
        }
        .queueScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
      `}</style>
    </div>
  );
}