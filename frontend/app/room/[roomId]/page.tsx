"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Headphones,
  LogOut,
  MessageCircle,
  Power,
  Settings,
  Share2,
  Users,
  X,
} from "lucide-react";

import MusicPlayer from "../../../room/MusicPlayer";
import ChatBox from "../../../room/ChatBox";
import MemberList from "../../../room/MemberList";
import PlaylistQueue from "../../../room/PlaylistQueue";
import AddSongDialog from "../../../room/AddSongDialog";
import RoomSettingsDialog from "../../../room/RoomSettingsDialog";
import MiniPlayer from "../../../components/player/MiniPlayer.tsx";
import Button from "../../../components/ui/Button";
import type { QueueSong } from "../../../types/websocket";
import type { QueueSongInput, RoomPermissions } from "../../../types/upload";
import { DEFAULT_ROOM_PERMISSIONS } from "../../../types/upload";
import type { YoutubePlayerHandle } from "../../../types/youtubePlayer";
import { extractYoutubeVideoId, isValidYoutubeUrl } from "../../../lib/youtube";
import { useRoomSocket } from "../../../hooks/useRoomSocket";
import { useResponsive } from "../../../hooks/useResponsive";
import { findSongBySrc } from "../../../lib/musicAPI";

const REPEAT_CYCLE = { off: "one", one: "all", all: "off" } as const;

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubePlayerRef = useRef<YoutubePlayerHandle>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { isCompact } = useResponsive();

  const [chatText, setChatText] = useState("");
  const [copied, setCopied] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [hasClickedListen, setHasClickedListen] = useState(false);
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
    updatePermissions,
    toggleShuffle,
    setRepeatMode,
    toggleLike,
    playerNext,
    playerPrev,
  } = useRoomSocket({
    roomId,
    audioRef,
    apiBase,
    youtubePlayerRef,
  });

  const queueSongs: QueueSong[] = roomState?.queueSongs ?? [];
  const isHost = roomState?.hostId === userId;
  const participants = roomState?.participants || [];
  const isPrivateRoom = roomState?.privacy === "private";
  const currentUserName = participants.find((p) => p.id === userId)?.name;
  const permissions: RoomPermissions = roomState?.permissions ?? DEFAULT_ROOM_PERMISSIONS;
  const shuffleEnabled = roomState?.shuffleEnabled ?? false;
  const repeatMode = roomState?.repeatMode ?? "off";
  const currentSongLiked = roomState?.currentSongLiked ?? false;

  // Tìm metadata bài đang phát từ musicAPI để hiển thị tên/ảnh đúng cho bài
  // thư viện; bài upload/YouTube dùng songTitle/songArtist/songCover mà
  // server đã broadcast (từ CurrentQueueSong khi bài tới từ hàng chờ).
  const currentSongMeta = findSongBySrc(roomState?.currentSong || "");
  const displaySongTitle = currentSongMeta?.songName ?? roomState?.songTitle;
  const displaySongArtist = currentSongMeta?.songArtist ?? roomState?.songArtist;
  const displaySongAvatar = currentSongMeta?.songAvatar ?? roomState?.songCover;

  // Host chọn bài từ SongPicker (tab "Tìm kiếm" trong AddSongDialog)
  const handleSongRequest = (song: {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    songSrc: string;
  }) => {
    if (isHost) {
      playSong(song.songSrc);
    }
    requestSong({
      id: song.id,
      title: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail,
      duration: song.duration,
      songSrc: song.songSrc,
      source: "library",
    });
  };

  // Bài từ tab "Tải file" hoặc "YouTube" trong AddSongDialog — server sẽ
  // tự kiểm tra quyền và tự điền requestedByName từ chính kết nối
  // WebSocket của người gửi.
  const handleAddSong = (song: QueueSongInput) => {
    requestSong({
      id: song.id,
      title: song.title,
      artist: song.artist,
      thumbnail: song.thumbnail,
      duration: song.duration,
      songSrc: song.songSrc,
      source: song.source,
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem("roomName");
    if (saved) setRoomName(saved);
  }, []);

  // Đóng drawer tự động khi màn hình trở lại desktop (tránh kẹt trạng
  // thái mở khi resize từ mobile lên desktop)
  useEffect(() => {
    if (!isCompact) {
      setIsSidebarOpen(false);
      setIsChatOpen(false);
    }
  }, [isCompact]);

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

    const src = roomState?.currentSong;
    const isYoutube = !!src && isValidYoutubeUrl(src);

    if (isYoutube) {
      // Bài đang phát là YouTube: activateYoutube() (trong useRoomSocket)
      // đã tự pause/reset thẻ <audio> gốc, nên không được gọi
      // handleInteract() ở đây — gọi audio.play() đúng lúc nó cũng đang
      // bị pause() sẽ gây đua nhau (AbortError) và làm needsInteraction
      // bị set lại true, khiến banner không bao giờ biến mất. Chỉ cần tự
      // kích hoạt phát video, ngay trong cùng 1 lần click của người dùng.
      const videoId = extractYoutubeVideoId(src!);
      if (videoId && roomState?.isPlaying) {
        youtubePlayerRef.current?.youtube.playVideo(videoId, roomState.progress || 0);
      }
      return;
    }

    // Bài đang phát là audio thường: cần handleInteract() để "mở khóa"
    // chính sách autoplay của trình duyệt cho thẻ <audio> gốc.
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

  const handleSavePermissions = (next: RoomPermissions) => {
    if (!isHost) return;
    updatePermissions(next);
  };

  const handleCycleRepeat = () => {
    if (!isHost) return;
    setRepeatMode(REPEAT_CYCLE[repeatMode]);
  };

  // ── Màn hình chờ duyệt ──────────────────────────────────────────────────────
  if (waitingApproval) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-text-primary">
        {rejectedMessage && (
          <div className="mb-5 rounded-card border border-key-border bg-key-soft px-6 py-3.5 font-medium text-key">
            {rejectedMessage}
          </div>
        )}
        <div className="glass-card max-w-[400px] rounded-card bg-surface/60 px-[30px] py-10 text-center">
          <div className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-[3px] border-white/10 border-t-key" />
          <h1 className="m-0 mb-3 text-xl font-semibold text-text-primary">Đang chờ host xác nhận</h1>
          <p className="text-[13px] text-text-secondary">
            Bạn đang yêu cầu tham gia phòng riêng tư. Vui lòng chờ chủ phòng phê duyệt.
          </p>
        </div>
      </main>
    );
  }

  const pendingCount = queueSongs.filter((s) => s.status === "pending").length;

  const sidebarContent = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 p-1">
        <Headphones size={19} className="text-text-primary" strokeWidth={2} />
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-text-secondary">
          Music Room
        </span>
        {isCompact && (
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-text-secondary hover:bg-white/10"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Yêu cầu tham gia phòng (chỉ Host) */}
      {isHost && joinRequests.length > 0 && (
        <div className="glass-card rounded-card bg-surface/60 p-[18px]">
          <div className="mb-3 flex items-center gap-2">
            <Users size={15} className="text-key" strokeWidth={2} />
            <h3 className="m-0 text-sm font-semibold text-text-primary">
              Yêu cầu tham gia ({joinRequests.length})
            </h3>
          </div>
          <div className="flex max-h-[280px] flex-col gap-2.5 overflow-y-auto">
            {joinRequests.map((req) => (
              <div
                key={req.userId}
                className="flex items-center justify-between rounded-input border border-divider bg-white/[0.03] px-3 py-2.5"
              >
                <span className="text-sm text-text-primary">{req.userName || "Người dùng"}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveJoin(req.userId)}
                    className="cursor-pointer rounded-button border border-border bg-white/5 px-3 py-1.5 text-[13px] text-text-secondary hover:bg-white/10"
                  >
                    Duyệt
                  </button>
                  <button
                    onClick={() => rejectJoin(req.userId)}
                    className="cursor-pointer rounded-button border border-divider bg-transparent px-3 py-1.5 text-[13px] text-text-muted hover:bg-white/5"
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
      <div className="glass-card rounded-card bg-surface/60 p-5">
        <div className="mb-4">
          <span className="text-sm font-semibold uppercase tracking-[0.1em] text-text-secondary">
            Điều khiển phòng
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {isHost && (
            <>
              <Button variant="secondary" fullWidth onClick={() => setIsSettingsOpen(true)} className="justify-start">
                <Settings size={16} strokeWidth={2} />
                Cài đặt phòng
              </Button>
              <Button variant="danger" fullWidth onClick={handleEndRoom} className="justify-start">
                <Power size={16} strokeWidth={2} />
                Kết thúc phòng
              </Button>
            </>
          )}
          <Button variant="ghost" fullWidth onClick={handleLeaveRoom} className="justify-start">
            <LogOut size={16} strokeWidth={2} />
            Rời phòng
          </Button>
        </div>
      </div>
    </div>
  );

  const chatContent = (
    <>
      <div className="glass-card mb-3 flex items-center justify-between rounded-card bg-surface/60 px-4 py-3">
        <span className="flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          <MessageCircle size={15} strokeWidth={2} />
          Trò chuyện
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{participants.length} online</span>
          {isCompact && (
            <button
              onClick={() => setIsChatOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-text-secondary hover:bg-white/10"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
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
    </>
  );

  return (
    <>
      <main className="min-h-screen bg-background px-6 py-5 pb-28 text-text-primary">
        <div className="mx-auto max-w-[1720px]">
          <div
            className={`grid items-start gap-5 ${
              isCompact ? "grid-cols-1" : "[grid-template-columns:280px_1fr_360px]"
            }`}
          >
            {/* ==================== CỘT TRÁI ==================== */}
            {!isCompact && sidebarContent}

            {/* ==================== CỘT GIỮA: Player + Hàng chờ ==================== */}
            <div className="flex flex-col gap-5">
              {/* Header Phòng */}
              <div className="glass-card flex items-center justify-between rounded-card bg-surface/60 px-[22px] py-4">
                <div className="flex items-center gap-3">
                  {isCompact && (
                    <button
                      onClick={() => setIsSidebarOpen(true)}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/5 text-text-secondary hover:bg-white/10"
                    >
                      <Users size={16} strokeWidth={2} />
                    </button>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="m-0 text-xl font-semibold text-text-primary">
                        {roomName || "Music Room"}
                      </h1>
                      <span
                        className={`rounded-full border px-[9px] py-0.5 text-[10px] uppercase tracking-[0.06em] ${
                          isPrivateRoom
                            ? "border-key-border bg-key-soft text-key"
                            : "border-border bg-white/5 text-text-secondary"
                        }`}
                      >
                        {isPrivateRoom ? "Riêng tư" : "Công khai"}
                      </span>
                      {isHost && (
                        <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-text-secondary">
                          Host
                        </span>
                      )}
                    </div>
                    <p className="m-0 mt-1 text-[13px] text-text-muted">
                      Phòng <strong className="text-text-secondary">{roomId}</strong> ·{" "}
                      {participants.length} người đang nghe
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div
                    className={`hidden items-center gap-1.5 rounded-full border bg-white/[0.03] px-3 py-1.5 sm:flex ${
                      connected ? "border-border" : "border-key-border"
                    }`}
                  >
                    <div className={`h-[7px] w-[7px] rounded-full ${connected ? "bg-key" : "bg-text-muted"}`} />
                    <span className={`text-xs ${connected ? "text-text-secondary" : "text-text-muted"}`}>
                      {connected ? "Đã kết nối" : "Đang kết nối..."}
                    </span>
                  </div>

                  <div className="hidden items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1.5 sm:flex">
                    <Users size={14} className="text-text-secondary" strokeWidth={2} />
                    <span className="text-[13px] text-text-secondary">{participants.length}</span>
                  </div>

                  {isCompact && (
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/5 text-text-secondary hover:bg-white/10"
                    >
                      <MessageCircle size={16} strokeWidth={2} />
                    </button>
                  )}

                  <Button variant={copied ? "primary" : "secondary"} size="sm" onClick={copyRoomLink}>
                    {copied ? <Check size={14} strokeWidth={2.5} /> : <Share2 size={14} strokeWidth={2} />}
                    <span className="hidden sm:inline">{copied ? "Đã sao chép" : "Chia sẻ phòng"}</span>
                  </Button>
                </div>
              </div>

              {/* MusicPlayer với metadata từ musicAPI + Shuffle/Repeat/Like */}
              <MusicPlayer
                ref={youtubePlayerRef}
                audioRef={audioRef}
                roomId={roomId}
                isHost={isHost}
                currentSong={roomState?.currentSong || ""}
                songTitle={displaySongTitle}
                songArtist={displaySongArtist}
                songAvatar={displaySongAvatar}
                isPlaying={roomState?.isPlaying || false}
                needsInteraction={!isHost && !hasClickedListen && (roomState?.isPlaying || needsInteraction)}
                onPlay={() => guardHost(handlePlay)}
                onPause={() => guardHost(handlePause)}
                onSeek={(seconds) => guardHost(() => handleSeek(seconds))}
                onInteract={handleListenTogether}
                onNext={() => guardHost(playerNext)}
                onPrev={() => guardHost(playerPrev)}
                shuffleEnabled={shuffleEnabled}
                repeatMode={repeatMode}
                isLiked={currentSongLiked}
                onToggleShuffle={() => guardHost(toggleShuffle)}
                onCycleRepeat={handleCycleRepeat}
                onToggleLike={toggleLike}
              />

              {/* Hàng chờ bài hát */}
              <div className="glass-card overflow-hidden rounded-card bg-surface/60">
                <div className="flex items-center justify-between px-4 pt-4">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                    {pendingCount > 0 ? `Hàng chờ (${pendingCount})` : "Hàng chờ"}
                  </span>
                  <Button variant="primary" size="sm" onClick={() => setIsAddSongOpen(true)}>
                    + Thêm bài hát
                  </Button>
                </div>

                <div className="p-3">
                  <PlaylistQueue
                    songs={queueSongs}
                    isHost={isHost}
                    onApprove={approveSong}
                    onReject={rejectSong}
                    onRemove={removeFromQueue}
                    onClearPending={clearPendingQueue}
                  />
                </div>
              </div>
            </div>

            {/* ==================== CỘT PHẢI: Chat ==================== */}
            {!isCompact && (
              <div className="sticky top-5 flex h-[calc(100vh-40px)] flex-col">{chatContent}</div>
            )}
          </div>
        </div>
      </main>

      {/* Drawer Sidebar (tablet/mobile) */}
      <AnimatePresence>
        {isCompact && isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-[900] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-[901] w-[300px] overflow-y-auto bg-background p-4"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Drawer Chat (tablet/mobile) */}
      <AnimatePresence>
        {isCompact && isChatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 z-[900] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: 360 }}
              animate={{ x: 0 }}
              exit={{ x: 360 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-[901] flex w-[340px] flex-col bg-background p-4"
            >
              {chatContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mini Player cố định cuối màn hình */}
      <MiniPlayer
        audioRef={audioRef}
        youtubePlayerRef={youtubePlayerRef}
        isHost={isHost}
        currentSong={roomState?.currentSong || ""}
        songTitle={displaySongTitle}
        songArtist={displaySongArtist}
        songAvatar={displaySongAvatar}
        isPlaying={roomState?.isPlaying || false}
        onPlay={() => guardHost(handlePlay)}
        onPause={() => guardHost(handlePause)}
        onSeek={() => guardHost(handleSeek)}
        onNext={() => guardHost(playerNext)}
        onPrev={() => guardHost(playerPrev)}
        shuffleEnabled={shuffleEnabled}
        repeatMode={repeatMode}
        isLiked={currentSongLiked}
        onToggleShuffle={() => guardHost(toggleShuffle)}
        onCycleRepeat={handleCycleRepeat}
        onToggleLike={toggleLike}
      />

      <AddSongDialog
        isOpen={isAddSongOpen}
        onClose={() => setIsAddSongOpen(false)}
        isHost={isHost}
        apiBase={apiBase}
        currentUserName={currentUserName}
        permissions={permissions}
        onRequestLibrarySong={handleSongRequest}
        onAddSong={handleAddSong}
      />

      {isHost && (
        <RoomSettingsDialog
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          permissions={permissions}
          onSave={handleSavePermissions}
        />
      )}
    </>
  );
}