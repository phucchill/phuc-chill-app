"use client";

import { useEffect, useRef, useState } from "react";
import { createSocket } from "../lib/socket";
import { useChatHistory } from "./useChatHistory";
import { useAudio } from "./useAudio";
import type { RoomState, WSMessage } from "../types/websocket";
import type { RoomPermissions, SongSource } from "../types/upload";
import type { YoutubePlayerHandle } from "../types/youtubePlayer";
import { extractYoutubeVideoId, isValidYoutubeUrl } from "../lib/youtube";
import { useRouter } from "next/navigation";

interface UseRoomSocketOptions {
  roomId: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  apiBase?: string;
  /** Ref tới YouTube IFrame Player (xem MusicPlayer.tsx) */
  youtubePlayerRef?: React.RefObject<YoutubePlayerHandle | null>;
}

export function useRoomSocket({
  roomId,
  audioRef,
  apiBase = "",
  youtubePlayerRef,
}: UseRoomSocketOptions) {
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const userIdRef = useRef("");
  const userNameRef = useRef("");

  const [userId, setUserId] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [rejectedMessage, setRejectedMessage] = useState("");

  const [joinRequests, setJoinRequests] = useState <
    { userId: string; userName: string }[]
  >([]);

  // Chỉ còn dùng needsInteraction/handleInteract từ useAudio (phần xử lý
  // chính sách autoplay của trình duyệt cho thẻ <audio> gốc). syncPlay/
  // syncPause/syncSeek KHÔNG còn dùng nữa — toàn bộ điều khiển audio/
  // YouTube giờ đi qua 2 hàm "trọng tài" activateAudio()/activateYoutube()
  // bên dưới, để đảm bảo 2 player luôn loại trừ lẫn nhau ở MỌI luồng (tự
  // bấm lẫn nhận đồng bộ từ server).
  const { needsInteraction, handleInteract } = useAudio(audioRef);

  const { messages, isLoading, appendMessage } = useChatHistory({
    roomId,
    currentUserId: userId,
    apiBase,
  });

  // Nhớ lại bài + trạng thái play/pause ĐÃ THỰC SỰ ÁP DỤNG lên player gần
  // nhất. ROOM_STATE được server broadcast cho MỌI thay đổi của phòng —
  // kể cả những việc chẳng liên quan gì tới playback (ai đó thêm bài vào
  // hàng chờ, join/leave, đổi quyền...). Nếu cứ thấy ROOM_STATE là seek +
  // play lại, nhạc đang phát sẽ bị khựng dù không có gì thay đổi. Ref này
  // giúp chỉ re-sync khi bài hoặc trạng thái play/pause THẬT SỰ đổi.
  const lastAppliedRef = useRef<{ src: string; isPlaying: boolean }>({
    src: "",
    isPlaying: false,
  });

  // ── Helper: bài hiện tại có phải link YouTube không ─────────────────────────
  const isYoutubeTrack = (src?: string) => !!src && isValidYoutubeUrl(src);

  // isSameAudioSrc(): so sánh audio.src (LUÔN là URL tuyệt đối do trình
  // duyệt tự chuẩn hoá) với src cần phát — src có thể là đường dẫn tương
  // đối (bài thư viện, vd "/Assets/songs/x.mp3") HOẶC URL tuyệt đối (file
  // upload, vd "http://host:8080/uploads/x.mp3", do backend trả về).
  const isSameAudioSrc = (audio: HTMLAudioElement, src: string) => {
    try {
      return audio.src === new URL(src, window.location.href).href;
    } catch {
      return audio.src === src;
    }
  };

  // ── TRỌNG TÀI: đảm bảo 2 player luôn loại trừ lẫn nhau ───────────────────────
  const activateYoutube = (videoId: string, startSeconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    youtubePlayerRef?.current?.youtube.playVideo(videoId, startSeconds);
  };

  const activateAudio = async (
    src: string,
    seekSeconds: number | undefined,
    autoplay: boolean
  ): Promise<boolean> => {
    youtubePlayerRef?.current?.youtube.pauseVideo();

    const audio = audioRef.current;
    if (!audio) return false;

    if (!isSameAudioSrc(audio, src)) {
      audio.src = src;
      audio.load();
    }

    if (typeof seekSeconds === "number") {
      audio.currentTime = seekSeconds;
    }

    if (!autoplay) return true;

    try {
      await audio.play();
      return true;
    } catch {
      return false;
    }
  };

  const pauseCurrent = (songId?: string) => {
    if (isYoutubeTrack(songId)) {
      youtubePlayerRef?.current?.youtube.pauseVideo();
    } else {
      audioRef.current?.pause();
    }
  };

  const seekCurrent = (songId: string | undefined, seconds: number) => {
    if (isYoutubeTrack(songId)) {
      youtubePlayerRef?.current?.youtube.seekTo(seconds);
    } else if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  };

  // ── Gửi message qua WebSocket ────────────────────────────────────────────────
  const sendWS = (type: string, payload: unknown) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    socketRef.current.send(
      JSON.stringify({ type, roomId, payload })
    );
  };

  // ── Xử lý message nhận từ server ─────────────────────────────────────────────
  const handleMessage = (data: WSMessage) => {
    const payload =
      typeof data.payload === "string"
        ? JSON.parse(data.payload)
        : data.payload;

    switch (data.type) {
      case "WAITING_APPROVAL": {
        setWaitingApproval(true);
        break;
      }

      case "JOIN_APPROVED": {
        setWaitingApproval(false);
        break;
      }

      case "JOIN_REJECTED": {
        localStorage.setItem(
          "room_notification",
          "Bạn đã bị host từ chối vào phòng"
        );
        socketRef.current?.close();
        router.push("/rooms");
        break;
      }

      case "ROOM_FULL": {
        alert(payload.message || "Phòng đã đủ 10 người");
        socketRef.current?.close();
        break;
      }

      case "ROOM_ENDED": {
        localStorage.setItem(
          "room_notification",
          payload?.message || "Phòng đã được host kết thúc"
        );
        socketRef.current?.close();
        router.push("/");
        break;
      }

      case "JOIN_REQUEST": {
        setJoinRequests((prev) => {
          const exists = prev.some((req) => req.userId === payload.userId);
          if (exists) return prev;
          return [...prev, { userId: payload.userId, userName: payload.userName || "Khách" }];
        });
        break;
      }

      case "ROOM_STATE": {
        setWaitingApproval(false);

        const state = payload as RoomState;
        setRoomState(state);

        const trackChanged = state.currentSong !== lastAppliedRef.current.src;
        const playStateChanged = state.isPlaying !== lastAppliedRef.current.isPlaying;

        if (trackChanged || playStateChanged) {
          lastAppliedRef.current = { src: state.currentSong, isPlaying: state.isPlaying };

          if (state.isPlaying && state.currentSong) {
            if (isYoutubeTrack(state.currentSong)) {
              const videoId = extractYoutubeVideoId(state.currentSong);
              if (videoId) {
                setTimeout(() => activateYoutube(videoId, state.progress || 0), 300);
              }
            } else {
              setTimeout(() => {
                void activateAudio(state.currentSong, state.progress || 0, true);
              }, 300);
            }
          } else {
            pauseCurrent(state.currentSong);
          }
        }

        break;
      }

      case "SYNC_PLAY": {
        if (payload.songId) {
          lastAppliedRef.current = { src: payload.songId, isPlaying: true };

          if (isYoutubeTrack(payload.songId)) {
            const videoId = extractYoutubeVideoId(payload.songId);
            if (videoId) activateYoutube(videoId, payload.progress || 0);
          } else {
            void activateAudio(payload.songId, payload.progress || 0, true);
          }
        }
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                currentSong: payload.songId || prev.currentSong,
                isPlaying: true,
                progress: payload.progress || 0,
              }
            : prev
        );
        break;
      }

      case "SYNC_PAUSE": {
        lastAppliedRef.current = { ...lastAppliedRef.current, isPlaying: false };
        pauseCurrent(payload.songId);
        setRoomState((prev) =>
          prev ? { ...prev, isPlaying: false, progress: payload.progress || 0 } : prev
        );
        break;
      }

      case "SYNC_SEEK": {
        seekCurrent(payload.songId, payload.progress || 0);
        setRoomState((prev) =>
          prev ? { ...prev, progress: payload.progress || 0 } : prev
        );
        break;
      }

      case "SYNC_PROGRESS": {
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                currentSong: payload.songId || prev.currentSong,
                isPlaying: payload.isPlaying,
                progress: payload.progress || 0,
              }
            : prev
        );
        break;
      }

      case "CHAT": {
        const senderId = data.senderId ?? payload.senderId ?? "";
        appendMessage({
          id: payload.id ?? payload._id,
          roomId,
          senderId,
          userName: payload.userName || payload.sender || "Ẩn danh",
          content: payload.content || payload.message || "",
          timestamp: data.timestamp ?? payload.timestamp ?? Date.now(),
          createdAt: payload.createdAt,
          isMine: senderId === userIdRef.current,
        });
        break;
      }

      case "QUEUE_REJECTED": {
        alert(payload.message || "Yêu cầu bài hát của bạn đã bị từ chối");
        break;
      }

      case "QUEUE_REMOVED": {
        alert(payload.message || "Bài hát của bạn đã bị xóa khỏi hàng chờ");
        break;
      }

      case "ERROR": {
        alert(payload.message || "Có lỗi xảy ra");
        break;
      }
    }
  };

  // ── Khởi tạo WebSocket ────────────────────────────────────────────────────────
  useEffect(() => {
    let id = localStorage.getItem("userId");
    const name = localStorage.getItem("userName") || "Khách";

    if (!id) {
      if (userIdRef.current) {
        id = userIdRef.current;
      } else {
        id = crypto?.randomUUID();
        localStorage.setItem("userId", id);
      }
    }

    userIdRef.current = id;
    userNameRef.current = name;
    setUserId(id);

    const socket = createSocket(roomId, id, name);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);

    socket.onmessage = (event: MessageEvent) => {
      const lines = event.data
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      for (const line of lines) {
        try {
          handleMessage(JSON.parse(line));
        } catch (err) {
          console.warn("[WS] Parse lỗi:", err);
        }
      }
    };

    socket.onclose = () => setConnected(false);

    socket.onerror = (err) => {
      console.error("[WS] Lỗi:", err);
      setConnected(false);
    };

    return () => {
      socket.close();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Auto-next khi bài hiện tại (mp3) phát hết ────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (roomState?.hostId && roomState.hostId === userIdRef.current) {
        sendWS("PLAYER_NEXT", {});
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState?.hostId, userId]);

  // ── Điều khiển nhạc (tự bấm tại chính client này) ────────────────────────────

  const handlePlay = async () => {
    const src = roomState?.currentSong;
    if (!src) return;

    if (isYoutubeTrack(src)) {
      const videoId = extractYoutubeVideoId(src);
      if (!videoId) return;

      const startAt = roomState?.progress || 0;
      activateYoutube(videoId, startAt);
      lastAppliedRef.current = { src, isPlaying: true };

      sendWS("SYNC_PLAY", { songId: src, progress: startAt, isPlaying: true });
      setRoomState((prev) => (prev ? { ...prev, isPlaying: true } : prev));
      return;
    }

    const ok = await activateAudio(src, undefined, true);
    if (!ok) {
      alert("Không phát được nhạc. Kiểm tra file mp3 hoặc đường dẫn.");
      return;
    }
    lastAppliedRef.current = { src, isPlaying: true };

    sendWS("SYNC_PLAY", {
      songId: src,
      progress: audioRef.current?.currentTime ?? 0,
      isPlaying: true,
    });
    setRoomState((prev) => (prev ? { ...prev, isPlaying: true } : prev));
  };

  const handlePause = () => {
    const src = roomState?.currentSong;

    if (isYoutubeTrack(src)) {
      const currentTime = youtubePlayerRef?.current?.youtube.getCurrentTime() ?? 0;
      youtubePlayerRef?.current?.youtube.pauseVideo();
      lastAppliedRef.current = { ...lastAppliedRef.current, isPlaying: false };

      sendWS("SYNC_PAUSE", { songId: src || "", progress: currentTime, isPlaying: false });
      setRoomState((prev) => (prev ? { ...prev, isPlaying: false, progress: currentTime } : prev));
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    lastAppliedRef.current = { ...lastAppliedRef.current, isPlaying: false };

    sendWS("SYNC_PAUSE", {
      songId: src || "",
      progress: audio.currentTime,
      isPlaying: false,
    });

    setRoomState((prev) => (prev ? { ...prev, isPlaying: false, progress: audio.currentTime } : prev));
  };

  // handleSeek(explicitSeconds?): nhận thêm tham số TÙY CHỌN là vị trí
  // CHÍNH XÁC người dùng vừa kéo tới (do MusicPlayer.tsx truyền lên qua
  // onSeek(val)). BẮT BUỘC ưu tiên dùng giá trị này thay vì tự đọc lại
  // youtubePlayerRef.current.youtube.getCurrentTime() — vì seekTo() của
  // YouTube là BẤT ĐỒNG BỘ (còn phải buffer), gọi getCurrentTime() ngay
  // sau khi seekTo() thường vẫn trả về vị trí CŨ (trước khi seek), khiến
  // SYNC_SEEK gửi đi sai vị trí và user khác không tua theo đúng chỗ host
  // vừa kéo tới. Vẫn giữ getCurrentTime() làm fallback cho các lần gọi cũ
  // không truyền tham số (không phá vỡ chỗ nào khác đang gọi handleSeek()
  // không đối số).
  const handleSeek = (explicitSeconds?: number) => {
    const src = roomState?.currentSong;

    if (isYoutubeTrack(src)) {
      const currentTime =
        explicitSeconds ?? (youtubePlayerRef?.current?.youtube.getCurrentTime() ?? 0);
      sendWS("SYNC_SEEK", {
        songId: src || "",
        progress: currentTime,
        isPlaying: roomState?.isPlaying ?? true,
      });
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    sendWS("SYNC_SEEK", {
      songId: src || "",
      progress: explicitSeconds ?? audio.currentTime,
      isPlaying: !audio.paused,
    });
  };

  const playSong = (songSrc: string) => {
    youtubePlayerRef?.current?.youtube.pauseVideo();

    sendWS("SYNC_PLAY", {
      songId: songSrc,
      progress: 0,
      isPlaying: true,
    });

    setRoomState((prev) =>
      prev
        ? { ...prev, currentSong: songSrc, isPlaying: true, progress: 0 }
        : prev
    );

    lastAppliedRef.current = { src: songSrc, isPlaying: true };

    void activateAudio(songSrc, 0, true).then((ok) => {
      if (!ok) alert("Không phát được bài này. Kiểm tra file mp3.");
    });
  };

  // ── Chat ─────────────────────────────────────────────────────────────────────

  const sendChat = (content: string) => {
    if (!content.trim()) return;
    sendWS("CHAT", {
      userName: userNameRef.current,
      content,
      senderId: userIdRef.current,
    });
  };

  // ── Quản lý thành viên ───────────────────────────────────────────────────────

  const approveJoin = (targetUserId: string) => {
    sendWS("JOIN_APPROVE", { userId: targetUserId });
    setJoinRequests((prev) => prev.filter((req) => req.userId !== targetUserId));
  };

  const rejectJoin = (targetUserId: string) => {
    sendWS("JOIN_REJECT", { userId: targetUserId });
    setJoinRequests((prev) => prev.filter((req) => req.userId !== targetUserId));
  };

  const leaveRoom = () => {
    sendWS("LEAVE_ROOM", { userId: userIdRef.current });
    socketRef.current?.close();
  };

  const endRoom = () => {
    sendWS("END_ROOM", { userId: userIdRef.current });
    socketRef.current?.close();
  };

  // ── Queue bài hát ─────────────────────────────────────────────────────────────

  const requestSong = (song: {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    songSrc?: string;
    source?: SongSource;
  }) => {
    sendWS("QUEUE_REQUEST", song);
  };

  const approveSong = (id: string) => sendWS("QUEUE_APPROVE", { id });

  const rejectSong = (id: string) => sendWS("QUEUE_REJECT", { id });

  const removeFromQueue = (id: string) => sendWS("QUEUE_REMOVE", { id });

  const clearPendingQueue = () => sendWS("QUEUE_CLEAR_PENDING", {});

  // ── Room settings / quyền ────────────────────────────────────────────────────

  const updatePermissions = (permissions: RoomPermissions) => {
    sendWS("PERMISSIONS_UPDATE", permissions);
  };

  // ── Shuffle / Repeat / Like ──────────────────────────────────────────────────

  const toggleShuffle = () => sendWS("SHUFFLE_TOGGLE", {});

  const setRepeatMode = (mode: "off" | "one" | "all") => {
    sendWS("REPEAT_MODE_UPDATE", { mode });
  };

  const toggleLike = () => sendWS("SONG_LIKE_TOGGLE", {});

  // ── Next / Prev ──────────────────────────────────────────────────────────────

  const playerNext = () => sendWS("PLAYER_NEXT", {});

  const playerPrev = () => sendWS("PLAYER_PREV", {});

  // ── Return ────────────────────────────────────────────────────────────────────

  return {
    userId,
    roomState,
    connected,
    messages,
    isLoading,
    waitingApproval,
    joinRequests,
    rejectedMessage,
    needsInteraction,
    // Audio
    handleInteract,
    handlePlay,
    handlePause,
    handleSeek,
    playSong,
    // Chat
    sendChat,
    // Thành viên
    approveJoin,
    rejectJoin,
    leaveRoom,
    endRoom,
    // Queue
    requestSong,
    approveSong,
    rejectSong,
    removeFromQueue,
    clearPendingQueue,
    // Room settings
    updatePermissions,
    // Shuffle / Repeat / Like
    toggleShuffle,
    setRepeatMode,
    toggleLike,
    // Player Next/Prev
    playerNext,
    playerPrev,
  };
}