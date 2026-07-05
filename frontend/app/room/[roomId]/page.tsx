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
      <main className="flex min-h-screen flex-col items-center justify-center bg-black p-6 font-sans text-white">
        {rejectedMessage && (
          <div className="mb-5 rounded-2xl border border-[#fa243c]/30 bg-[#fa243c]/10 px-6 py-3.5 font-medium text-[#fa243c]">
            {rejectedMessage}
          </div>
        )}
        <div className="max-w-[400px] rounded-3xl border border-white/10 bg-[#0c0c0e] px-[30px] py-10 text-center">
          <div className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-[3px] border-white/10 border-t-[#ff2d55]" />
          <h1 className="m-0 mb-3 text-xl font-semibold">Đang chờ host xác nhận</h1>
          <p className="text-[13px] text-white/50">
            Bạn đang yêu cầu tham gia phòng riêng tư. Vui lòng chờ chủ phòng phê duyệt.
          </p>
        </div>
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

      <main className="min-h-screen bg-black px-6 py-5 font-sans text-white">
        <div className="mx-auto max-w-[1720px]">
          {/* Chat giờ là 1 cột riêng bên phải => 3 cột: trái (280) / giữa (1fr) / chat (360) */}
          <div className="grid items-start gap-5 [grid-template-columns:280px_1fr_360px]">
            {/* ==================== CỘT TRÁI ==================== */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5 p-1">
                <span className="text-[19px]">🎧</span>
                <span className="font-serif text-sm uppercase tracking-[0.2em] text-white/55">
                  MUSIC ROOM
                </span>
              </div>

              {/* Yêu cầu tham gia phòng (chỉ Host) */}
              {isHost && joinRequests.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-[#111113] p-[18px]">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[15px] text-white/70">⏳</span>
                    <h3 className="m-0 text-sm font-semibold text-white/80">
                      Yêu cầu tham gia ({joinRequests.length})
                    </h3>
                  </div>
                  <div className="flex max-h-[280px] flex-col gap-2.5 overflow-y-auto">
                    {joinRequests.map((req) => (
                      <div
                        key={req.userId}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
                      >
                        <span className="text-sm text-white/90">
                          {req.userName || "Người dùng"}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveJoin(req.userId)}
                            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white/70 hover:bg-white/10"
                          >
                            Duyệt
                          </button>
                          <button
                            onClick={() => rejectJoin(req.userId)}
                            className="cursor-pointer rounded-lg border border-white/5 bg-transparent px-3 py-1.5 text-[13px] text-white/40 hover:bg-white/5"
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
              <div className="rounded-3xl border border-white/5 bg-[#111113] p-5">
                <div className="mb-4">
                  <span className="font-serif text-sm uppercase tracking-[0.15em] text-white/45">
                    ĐIỀU KHIỂN PHÒNG
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {isHost && (
                    <>
                      <button
                        onClick={() => alert("Cài đặt phòng - đang phát triển")}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left text-sm text-black hover:bg-white/90"
                      >
                        ⚙️ Cài đặt phòng
                      </button>
                      <button
                        onClick={handleEndRoom}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left text-sm text-black hover:bg-white/90"
                      >
                        ⏹️ Kết thúc phòng
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleLeaveRoom}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-[#fa243c] px-4 py-3.5 text-left text-sm text-white hover:bg-[#fa243c]/90 ${
                      isHost ? "mt-2" : ""
                    }`}
                  >
                    ← Rời phòng
                  </button>
                </div>
              </div>
            </div>

            {/* ==================== CỘT GIỮA: Player + Hàng chờ/Chọn bài ==================== */}
            <div className="flex flex-col gap-5">
              {/* Header Phòng */}
              <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#111113] px-[22px] py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="m-0 font-serif text-xl font-bold text-white">
                      {roomName || "Music Room"}
                    </h1>
                    <span
                      className={`rounded-full border px-[9px] py-0.5 text-[10px] uppercase tracking-[0.06em] ${
                        isPrivateRoom
                          ? "border-[#fa243c]/25 bg-[#fa243c]/10 text-[#fa243c]"
                          : "border-white/15 bg-white/5 text-white/70"
                      }`}
                    >
                      {isPrivateRoom ? "Riêng tư" : "Công khai"}
                    </span>
                    {isHost && (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-white/70">
                        Host
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-1 text-[13px] text-white/45">
                    Phòng <strong>{roomId}</strong> · {participants.length} người đang nghe
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex items-center gap-1.5 rounded-full border bg-white/[0.03] px-3 py-1.5 ${
                      connected ? "border-white/20" : "border-[#fa243c]/30"
                    }`}
                  >
                    <div
                      className={`h-[7px] w-[7px] rounded-full ${
                        connected ? "bg-white/70" : "bg-[#fa243c]"
                      }`}
                    />
                    <span className={`text-xs ${connected ? "text-white/70" : "text-[#fa243c]"}`}>
                      {connected ? "Đã kết nối" : "Đang kết nối..."}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span className="text-[13px] text-white/80">{participants.length}</span>
                  </div>

                  <button
                    onClick={copyRoomLink}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-[13px] ${
                      copied
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {copied ? "✓ Đã sao chép" : "Chia sẻ phòng"}
                  </button>
                </div>
              </div>

              {/* MusicPlayer với metadata từ musicAPI — vùng phát sáng neon duy nhất */}
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
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#111113]">
                {/* Tab switcher: Hàng chờ / Chọn bài */}
                <div className="m-3 flex gap-0.5 rounded-2xl border border-white/5 bg-black/30 p-1">
                  {(
                    [
                      { key: "queue", label: pendingCount > 0 ? `🎵 Hàng chờ (${pendingCount})` : "🎵 Hàng chờ" },
                      { key: "picker", label: "＋ Chọn bài" },
                    ] as { key: "queue" | "picker"; label: string }[]
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCenterTab(key)}
                      className={`flex-1 rounded-[10px] border-none px-1 py-2 text-xs transition-colors ${
                        centerTab === key
                          ? "bg-white font-medium text-black"
                          : "bg-transparent text-white/35 hover:text-white/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="px-3 pb-3">
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
                    <SongPicker isHost={isHost} onRequest={handleSongRequest} />
                  )}
                </div>
              </div>
            </div>

            {/* ==================== CỘT PHẢI: Chat riêng ==================== */}
            <div className="sticky top-5 flex h-[calc(100vh-40px)] flex-col">
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/5 bg-[#111113] px-4 py-3">
                <span className="font-serif text-[15px] uppercase tracking-[0.1em] text-white/70">
                  💬 Trò chuyện
                </span>
                <span className="text-xs text-white/40">{participants.length} online</span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
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