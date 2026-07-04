"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import MusicPlayer from "../../../room/MusicPlayer";
import ChatBox from "../../../room/ChatBox";
import MemberList from "../../../room/MemberList";
import PlaylistQueue from "../../../room/PlaylistQueue";
import SongPicker from "../../../room/SongPicker";
import type { QueueSong } from "../../../types/websocket";
import { useRoomSocket } from "../../../hooks/useRoomSocket";
import { findSongBySrc } from "../../../lib/musicAPI";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [chatText, setChatText] = useState("");
  const [copied, setCopied] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [hasClickedListen, setHasClickedListen] = useState(false);
  // Chat đã tách thành cột riêng => tab switcher chỉ còn "queue" | "picker"
  const [centerTab, setCenterTab] = useState<"queue" | "picker">("queue");

  const {
    userId,
    roomState,
    connected,
    messages,
    isLoading,
    sendChat,
    needsInteraction,
    handleInteract,
    handlePlay,
    handlePause,
    handleSeek,
    playSong,
    waitingApproval,
    joinRequests,
    rejectedMessage,
    approveJoin,
    rejectJoin,
    leaveRoom,
    endRoom,
    requestSong,
    approveSong,
    rejectSong,
    removeFromQueue,
    clearPendingQueue,
    playerNext,
    playerPrev,
  } = useRoomSocket({
    roomId,
    audioRef,
    apiBase: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
  });

  const queueSongs: QueueSong[] = roomState?.queueSongs ?? [];
  const isHost = roomState?.hostId === userId;
  const participants = roomState?.participants || [];
  const isPrivateRoom = roomState?.privacy === "private";

  // Tìm metadata bài đang phát từ musicAPI để hiển thị tên/ảnh đúng
  const currentSongMeta = findSongBySrc(roomState?.currentSong || "");

  // Host chọn bài từ SongPicker
  const handleSongRequest = (song: {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    songSrc: string;
  }) => {
    if (isHost) {
      // Host: phát ngay và sync toàn phòng
      playSong(song.songSrc);
    }
    // Cả host lẫn member đều gửi QUEUE_REQUEST — server tự xử lý theo role.
    // QUAN TRỌNG: phải truyền songSrc xuống, nếu không server sẽ không thể
    // so khớp với bài đang phát (chặn request trùng) và Next/Prev sẽ
    // không biết file mp3 nào để load.
    requestSong({
      id: song.id,
      title: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail,
      duration: song.duration,
      songSrc: song.songSrc,
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem("roomName");
    if (saved) setRoomName(saved);
  }, []);

  // Tự chuyển sang tab "Hàng chờ" khi có bài pending mới (chỉ host)
  useEffect(() => {
    const pendingCount = queueSongs.filter((s) => s.status === "pending").length;
    if (isHost && pendingCount > 0 && centerTab !== "queue") {
      setCenterTab("queue");
    }
  }, [queueSongs, isHost]);

  const onSend = (customText?: string) => {
    const content = customText ?? chatText;
    if (!content.trim()) return;
    sendChat(content);
    setChatText("");
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const guardHost = (fn: () => void) => {
    if (!isHost) {
      alert("Chỉ host mới được điều khiển nhạc");
      return;
    }
    fn();
  };

  const handleListenTogether = () => {
    setHasClickedListen(true);
    handleInteract();
  };

  const handleLeaveRoom = () => {
    if (confirm("Bạn có chắc muốn rời khỏi phòng?")) {
      leaveRoom();
      window.location.href = "/";
    }
  };

  const handleEndRoom = () => {
    if (confirm("Kết thúc phòng sẽ ngắt kết nối tất cả mọi người đang nghe. Bạn có chắc chắn?")) {
      endRoom();
      window.location.href = "/";
    }
  };

  // ── Màn hình chờ duyệt ──────────────────────────────────────────────────────
  if (waitingApproval) {
    return (
      <main style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #020617 0%, #0d0720 40%, #020617 100%)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}>
        {rejectedMessage && (
          <div style={{
            padding: "14px 24px",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 16,
            marginBottom: 20,
            fontWeight: 500,
          }}>
            {rejectedMessage}
          </div>
        )}
        <div style={{
          padding: "40px 30px",
          borderRadius: 24,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(167,139,250,0.15)",
          textAlign: "center",
          maxWidth: 400,
        }}>
          <div style={{
            width: 32, height: 32,
            border: "3px solid rgba(167,139,250,0.2)",
            borderTopColor: "#a78bfa",
            borderRadius: "50%",
            margin: "0 auto 20px",
            animation: "spin 1s linear infinite",
          }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 12px" }}>
            Đang chờ host xác nhận
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            Bạn đang yêu cầu tham gia phòng riêng tư. Vui lòng chờ chủ phòng phê duyệt.
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  const pendingCount = queueSongs.filter((s) => s.status === "pending").length;

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap"
      />

      <main style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #020617 0%, #0d0720 40%, #020617 100%)",
        padding: "20px 24px",
        color: "white",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ maxWidth: 1720, margin: "0 auto" }}>
          {/* Chat giờ là 1 cột riêng bên phải => 3 cột: trái (280) / giữa (1fr) / chat (360) */}
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 360px", gap: 20, alignItems: "start" }}>

            {/* ==================== CỘT TRÁI ==================== */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px" }}>
                <span style={{ fontSize: 19 }}>🎧</span>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 14,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                }}>
                  MUSIC ROOM
                </span>
              </div>

              {/* Yêu cầu tham gia phòng (chỉ Host) */}
              {isHost && joinRequests.length > 0 && (
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(167,139,250,0.25)",
                  borderRadius: 20,
                  padding: 18,
                  backdropFilter: "blur(20px)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ color: "#a78bfa", fontSize: 15 }}>⏳</span>
                    <h3 style={{ margin: 0, color: "#c4b5fd", fontSize: 14, fontWeight: 600 }}>
                      Yêu cầu tham gia ({joinRequests.length})
                    </h3>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
                    {joinRequests.map((req) => (
                      <div
                        key={req.userId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.9)" }}>
                          {req.userName || "Người dùng"}
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => approveJoin(req.userId)}
                            style={{
                              padding: "6px 12px",
                              background: "rgba(52,211,153,0.15)",
                              border: "1px solid rgba(52,211,153,0.4)",
                              borderRadius: 8,
                              color: "#34d399",
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            Duyệt
                          </button>
                          <button
                            onClick={() => rejectJoin(req.userId)}
                            style={{
                              padding: "6px 12px",
                              background: "rgba(248,113,113,0.1)",
                              border: "1px solid rgba(248,113,113,0.4)",
                              borderRadius: 8,
                              color: "#f87171",
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            Từ chối
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <MemberList participants={participants} />

              {/* Điều khiển phòng */}
              <div style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 24,
                padding: "20px",
                backdropFilter: "blur(20px)",
              }}>
                <div style={{ marginBottom: 16 }}>
                  <span style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 14,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.45)",
                  }}>
                    ĐIỀU KHIỂN PHÒNG
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {isHost && (
                    <>
                      <button
                        onClick={() => alert("Cài đặt phòng - đang phát triển")}
                        style={{
                          padding: "14px 16px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          fontSize: 14,
                          cursor: "pointer",
                          textAlign: "left",
                          color: "white",
                        }}
                      >
                        ⚙️ Cài đặt phòng
                      </button>
                      <button
                        onClick={handleEndRoom}
                        style={{
                          padding: "14px 16px",
                          background: "linear-gradient(135deg, rgba(248,113,113,0.22), rgba(239,68,68,0.12))",
                          border: "1px solid rgba(248,113,113,0.35)",
                          borderRadius: 16,
                          color: "#fca5a5",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          fontSize: 14,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        ⏹️ Kết thúc phòng
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleLeaveRoom}
                    style={{
                      padding: "14px 16px",
                      background: "rgba(248,113,113,0.1)",
                      border: "1px solid rgba(248,113,113,0.25)",
                      borderRadius: 16,
                      color: "#f87171",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      fontSize: 14,
                      cursor: "pointer",
                      marginTop: isHost ? 8 : 0,
                    }}
                  >
                    ← Rời phòng
                  </button>
                </div>
              </div>
            </div>

            {/* ==================== CỘT GIỮA: Player + Hàng chờ/Chọn bài ==================== */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Header Phòng */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 20,
                padding: "16px 22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backdropFilter: "blur(20px)",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h1 style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 20,
                      fontWeight: 700,
                      margin: 0,
                    }}>
                      {roomName || "Music Room"}
                    </h1>
                    <span style={{
                      padding: "2px 9px",
                      borderRadius: 20,
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      background: isPrivateRoom ? "rgba(248,113,113,0.12)" : "rgba(52,211,153,0.12)",
                      border: `1px solid ${isPrivateRoom ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"}`,
                      color: isPrivateRoom ? "#f87171" : "#34d399",
                    }}>
                      {isPrivateRoom ? "Riêng tư" : "Công khai"}
                    </span>
                    {isHost && (
                      <span style={{
                        padding: "2px 8px",
                        background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(236,72,153,0.2))",
                        border: "1px solid rgba(167,139,250,0.3)",
                        borderRadius: 20,
                        fontSize: 10,
                        color: "#a78bfa",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}>
                        Host
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                    Phòng <strong>{roomId}</strong> · {participants.length} người đang nghe
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${connected ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                    borderRadius: 20,
                  }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: connected ? "#34d399" : "#f87171",
                    }} />
                    <span style={{ fontSize: 12, color: connected ? "#34d399" : "#f87171" }}>
                      {connected ? "Đã kết nối" : "Đang kết nối..."}
                    </span>
                  </div>

                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(167,139,250,0.2)",
                    borderRadius: 20,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span style={{ fontSize: 13 }}>{participants.length}</span>
                  </div>

                  <button onClick={copyRoomLink} style={{
                    padding: "8px 16px",
                    background: copied ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.05)",
                    border: copied ? "1px solid #34d399" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 20,
                    color: copied ? "#34d399" : "white",
                    fontSize: 13,
                    cursor: "pointer",
                  }}>
                    {copied ? "✓ Đã sao chép" : "Chia sẻ phòng"}
                  </button>
                </div>
              </div>

              {/* MusicPlayer với metadata từ musicAPI */}
              <MusicPlayer
                audioRef={audioRef}
                roomId={roomId}
                isHost={isHost}
                currentSong={roomState?.currentSong || ""}
                songTitle={currentSongMeta?.songName}
                songArtist={currentSongMeta?.songArtist}
                songAvatar={currentSongMeta?.songAvatar}
                isPlaying={roomState?.isPlaying || false}
                needsInteraction={!isHost && roomState?.isPlaying && !hasClickedListen ? true : needsInteraction}
                onPlay={() => guardHost(handlePlay)}
                onPause={() => guardHost(handlePause)}
                onSeek={() => guardHost(handleSeek)}
                onInteract={handleListenTogether}
                onNext={() => guardHost(playerNext)}
                onPrev={() => guardHost(playerPrev)}
              />

              {/* Hàng chờ bài hát / Chọn bài — nằm ngay dưới MusicPlayer */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 20,
                backdropFilter: "blur(20px)",
                overflow: "hidden",
              }}>
                {/* Tab switcher: Hàng chờ / Chọn bài */}
                <div style={{
                  display: "flex",
                  gap: 2,
                  padding: 4,
                  margin: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                }}>
                  {(
                    [
                      { key: "queue", label: pendingCount > 0 ? `🎵 Hàng chờ (${pendingCount})` : "🎵 Hàng chờ" },
                      { key: "picker", label: "＋ Chọn bài" },
                    ] as { key: "queue" | "picker"; label: string }[]
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCenterTab(key)}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "'DM Sans', sans-serif",
                        transition: "all 0.15s",
                        background: centerTab === key
                          ? "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(236,72,153,0.2))"
                          : "transparent",
                        color: centerTab === key ? "#c4b5fd" : "rgba(255,255,255,0.35)",
                        fontWeight: centerTab === key ? 500 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div style={{ padding: "0 12px 12px" }}>
                  {centerTab === "queue" && (
                    <PlaylistQueue
                      songs={queueSongs}
                      isHost={isHost}
                      onApprove={approveSong}
                      onReject={rejectSong}
                      onRemove={removeFromQueue}
                      onClearPending={clearPendingQueue}
                    />
                  )}

                  {centerTab === "picker" && (
                    <SongPicker
                      isHost={isHost}
                      onRequest={handleSongRequest}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ==================== CỘT PHẢI: Chat riêng ==================== */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - 40px)",
              position: "sticky",
              top: 20,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                marginBottom: 12,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16,
                backdropFilter: "blur(20px)",
              }}>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 15,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                }}>
                  💬 Trò chuyện
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  {participants.length} online
                </span>
              </div>

              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <ChatBox
                  messages={messages}
                  chatText={chatText}
                  setChatText={setChatText}
                  onSend={onSend}
                  chatEndRef={chatEndRef}
                  isLoading={isLoading}
                />
              </div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}