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
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20,
        overflow: "hidden",
        backdropFilter: "blur(20px)",
        height: 380,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header (cố định, không scroll) */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(21, 23, 45, 0.02)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 13,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.4)",
            whiteSpace: "nowrap",
          }}
        >
          Danh sách chờ
        </span>

        {songs.length > 0 && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 20,
              background:
                "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(236,72,153,0.2))",
              border: "1px solid rgba(167,139,250,0.3)",
              fontSize: 11,
              color: "#a78bfa",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {songs.length}
          </span>
        )}

        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "rgba(255,255,255,0.25)",
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: "nowrap",
          }}
        >
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
      <div
        className="queueScroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
            background: "#1a192b",
          flexDirection: "column",
        }}
      >
        {songs.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "rgba(255,255,255,0.2)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
            }}
          >
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  flexShrink: 0,
                }}
              >
                {/* Tay kéo sắp xếp (chỉ mang tính trực quan) */}
                <span
                  style={{
                    color: "rgba(255,255,255,0.15)",
                    fontSize: 14,
                    cursor: isHost ? "grab" : "default",
                    flexShrink: 0,
                  }}
                >
                  ⠿
                </span>

                {/* Số thứ tự */}
                <span
                  style={{
                    width: 16,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: "'DM Sans', sans-serif",
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>

                {/* Ảnh bìa */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: song.thumbnail
                      ? `url(${song.thumbnail}) center/cover`
                      : "linear-gradient(135deg, #312e81, #4c1d95)",
                    flexShrink: 0,
                  }}
                />

                {/* Tên bài / ca sĩ */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.9)",
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {song.title}
                  </p>
                  {song.artist && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11,
                        color: "rgba(255,255,255,0.35)",
                        fontFamily: "'DM Sans', sans-serif",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {song.artist}
                    </p>
                  )}
                </div>

                {/* Thời lượng */}
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "'DM Sans', sans-serif",
                    flexShrink: 0,
                  }}
                >
                  {formatDuration(song.duration)}
                </span>

                {/* Hành động */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                    minWidth: 50,
                    justifyContent: "flex-end",
                  }}
                >
                  {isPending && isHost && (
                    <>
                      <button
                        onClick={() => onApprove?.(song.id)}
                        title="Duyệt"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: "rgba(52,211,153,0.15)",
                          border: "1px solid rgba(52,211,153,0.3)",
                          color: "#34d399",
                          fontSize: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ✔
                      </button>
                      <button
                        onClick={() => onReject?.(song.id)}
                        title="Từ chối"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: "rgba(248,113,113,0.1)",
                          border: "1px solid rgba(248,113,113,0.2)",
                          color: "#f87171",
                          fontSize: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        ✖
                      </button>
                    </>
                  )}

                  {isPending && !isHost && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "rgba(167,139,250,0.6)",
                        fontFamily: "'DM Sans', sans-serif",
                        fontStyle: "italic",
                      }}
                    >
                      Đang chờ
                    </span>
                  )}

                  {!isPending &&
                    (showRemove ? (
                      <button
                        onClick={() => onRemove?.(song.id)}
                        title="Xóa khỏi danh sách chờ"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: "rgba(248,113,113,0.1)",
                          border: "1px solid rgba(248,113,113,0.2)",
                          color: "#f87171",
                          fontSize: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
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
          style={{
            margin: 12,
            padding: "10px 0",
            borderRadius: 10,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.15)",
            color: "#f87171",
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            flexShrink: 0,
          }}
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
          background: linear-gradient(180deg, rgba(124,58,237,0.7), rgba(236,72,153,0.7));
          border-radius: 999px;
        }
        .queueScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(167,139,250,0.65) transparent;
        }
      `}</style>
    </div>
  );
}