"use client";

import { useEffect, useRef, useState } from "react";
import { createSocket } from "../lib/socket";
import { useChatHistory } from "./useChatHistory";
import { useAudio } from "./useAudio";
import type { RoomState, WSMessage } from "../types/websocket";
import { useRouter } from "next/navigation";

interface UseRoomSocketOptions {
  roomId: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  apiBase?: string;
}

export function useRoomSocket({
  roomId,
  audioRef,
  apiBase = "",
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

  const {
    needsInteraction,
    syncPlay,
    syncPause,
    syncSeek,
    handleInteract,
  } = useAudio(audioRef);

  const { messages, isLoading, appendMessage } = useChatHistory({
    roomId,
    currentUserId: userId,
    apiBase,
  });

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

        // Không còn file mặc định /music/sao-hang-a.mp3 nữa — nếu phòng
        // chưa có bài nào (currentSong rỗng) thì không cố phát gì cả,
        // chỉ đồng bộ progress/pause.
        if (state.isPlaying && state.currentSong) {
          setTimeout(() => {
            void syncPlay(state.currentSong, state.progress || 0);
          }, 300);
        } else {
          syncPause(state.progress || 0);
        }

        break;
      }

      case "SYNC_PLAY": {
        if (payload.songId) {
          syncPlay(payload.songId, payload.progress || 0);
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
        syncPause(payload.progress || 0);
        setRoomState((prev) =>
          prev ? { ...prev, isPlaying: false, progress: payload.progress || 0 } : prev
        );
        break;
      }

      case "SYNC_SEEK": {
        syncSeek(payload.progress || 0);
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

  // ── Auto-next khi bài hiện tại phát hết ─────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      // Chỉ host gửi lệnh next — tránh mỗi client trong phòng đều tự ý
      // gửi PLAYER_NEXT cùng lúc khi audio kết thúc đồng thời.
      if (roomState?.hostId && roomState.hostId === userIdRef.current) {
        sendWS("PLAYER_NEXT", {});
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState?.hostId, userId]);

  // ── Điều khiển nhạc ──────────────────────────────────────────────────────────

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const src = roomState?.currentSong;

    // Không còn fallback về /music/sao-hang-a.mp3 (đã xóa file này).
    // Nếu phòng chưa có bài nào được chọn thì báo host chọn bài trước,
    // thay vì cố phát 1 file không tồn tại.
    if (!src) {
    return;
  }

    try {
      const currentPath = new URL(audio.src).pathname;
      if (currentPath !== src && !currentPath.endsWith(src)) {
        audio.src = src;
        audio.load();
      }
    } catch {
      audio.src = src;
      audio.load();
    }

    try {
      await audio.play();

      sendWS("SYNC_PLAY", {
        songId: src,
        progress: audio.currentTime,
        isPlaying: true,
      });

      setRoomState((prev) =>
        prev ? { ...prev, isPlaying: true } : prev
      );
    } catch {
      alert("Không phát được nhạc. Kiểm tra file mp3 hoặc đường dẫn.");
    }
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();

    sendWS("SYNC_PAUSE", {
      songId: roomState?.currentSong || "",
      progress: audio.currentTime,
      isPlaying: false,
    });

    setRoomState((prev) =>
      prev ? { ...prev, isPlaying: false } : prev
    );
  };

  const handleSeek = () => {
    const audio = audioRef.current;
    if (!audio) return;

    sendWS("SYNC_SEEK", {
      songId: roomState?.currentSong || "",
      progress: audio.currentTime,
      isPlaying: !audio.paused,
    });
  };

  // Host chọn bài mới từ SongPicker → đổi src, phát, sync toàn phòng
  const playSong = (songSrc: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Gửi SYNC_PLAY NGAY (optimistic) trước khi audio.play() resolve.
    // Lý do: nếu để trong .then() như bản cũ, message khác gửi gần như
    // đồng thời (vd QUEUE_REQUEST) có thể khiến server broadcast lại
    // ROOM_STATE với isPlaying:false (state cũ, do server CHƯA nhận
    // SYNC_PLAY) → client tự gọi syncPause() đè lên audio đang play(),
    // làm promise play() bị abort ("AbortError") → rơi vào catch() báo
    // lỗi sai lệch dù file mp3 hoàn toàn hợp lệ.
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

    try {
      const currentPath = new URL(audio.src).pathname;
      if (currentPath !== songSrc && !currentPath.endsWith(songSrc)) {
        audio.src = songSrc;
        audio.load();
      }
    } catch {
      audio.src = songSrc;
      audio.load();
    }

    audio.play().catch(() => {
      alert("Không phát được bài này. Kiểm tra file mp3.");
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

  // Bản thân rời phòng — phòng vẫn tồn tại cho người khác
  const leaveRoom = () => {
    sendWS("LEAVE_ROOM", { userId: userIdRef.current });
    socketRef.current?.close();
  };

  // Host kết thúc phòng — đóng cả phòng cho tất cả
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
  }) => {
    sendWS("QUEUE_REQUEST", song);
  };

  const approveSong = (id: string) => sendWS("QUEUE_APPROVE", { id });

  const rejectSong = (id: string) => sendWS("QUEUE_REJECT", { id });

  const removeFromQueue = (id: string) => sendWS("QUEUE_REMOVE", { id });

  const clearPendingQueue = () => sendWS("QUEUE_CLEAR_PENDING", {});

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
    // Player Next/Prev
    playerNext,
    playerPrev,
  };
}