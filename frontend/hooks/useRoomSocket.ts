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

  // State quản lý danh sách yêu cầu tham gia phòng (dành cho Host)
  const [joinRequests, setJoinRequests] = useState<
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

  const sendWS = (type: string, payload: unknown) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type,
        roomId,
        payload,
      })
    );
  };

  const handleMessage = (data: WSMessage) => {
    const payload =
      typeof data.payload === "string" ? JSON.parse(data.payload) : data.payload;

    switch (data.type) {
      case "WAITING_APPROVAL": {
        setWaitingApproval(true);
        // alert(payload.message || "Đang chờ host chấp nhận vào phòng");
        break;
      }

      // SỬA LỖI 3: Loại bỏ hoàn toàn alert để tránh block UI và làm chậm tiến trình render dữ liệu
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

      // Host đã kết thúc phòng — mọi người trong phòng đều nhận message này
      // và bị đưa về trang chủ.
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

          return [
            ...prev,
            {
              userId: payload.userId,
              userName: payload.userName || "Khách",
            },
          ];
        });
        break;
      }

      // SỬA LỖI 4: Ép tắt màn hình chờ duyệt và bọc nhạc trong setTimeout để tránh conflict tiến trình Audio context
      case "ROOM_STATE": {
      setWaitingApproval(false);

      const state = payload as RoomState;

      setRoomState(state);

      if (state.isPlaying) {
        setTimeout(() => {
          void syncPlay(
            state.currentSong || "/music/sao-hang-a.mp3",
            state.progress || 0
          );
        }, 300);
      } else {
        syncPause(state.progress || 0);
      }

      break;
    }

      case "SYNC_PLAY": {
        syncPlay(payload.songId || "/music/sao-hang-a.mp3", payload.progress || 0);

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
          prev
            ? {
                ...prev,
                isPlaying: false,
                progress: payload.progress || 0,
              }
            : prev
        );

        break;
      }

      case "SYNC_SEEK": {
        syncSeek(payload.progress || 0);

        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                progress: payload.progress || 0,
              }
            : prev
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

      case "ERROR": {
        alert(payload.message || "Có lỗi xảy ra");
        break;
      }
    }
  };

  useEffect(() => {
    let id = localStorage.getItem("userId");
    const name = localStorage.getItem("userName") || "Khách";

    if (!id) {
      if (userIdRef.current) {
        id = userIdRef.current;
      } else {
        id = crypto.randomUUID();
        localStorage.setItem("userId", id);
      }
    }

    userIdRef.current = id;
    userNameRef.current = name;
    setUserId(id);

    const socket = createSocket(roomId, id, name);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
    };

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

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onerror = (err) => {
      console.error("[WS] Lỗi:", err);
      setConnected(false);
    };

    return () => {
      socket.close();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handlePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const src = roomState?.currentSong || "/music/sao-hang-a.mp3";

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
        prev
          ? {
              ...prev,
              isPlaying: true,
            }
          : prev
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
      songId: roomState?.currentSong || "/music/sao-hang-a.mp3",
      progress: audio.currentTime,
      isPlaying: false,
    });

    setRoomState((prev) =>
      prev
        ? {
            ...prev,
            isPlaying: false,
          }
        : prev
    );
  };

  const handleSeek = () => {
    const audio = audioRef.current;
    if (!audio) return;

    sendWS("SYNC_SEEK", {
      songId: roomState?.currentSong || "/music/sao-hang-a.mp3",
      progress: audio.currentTime,
      isPlaying: !audio.paused,
    });
  };

  const sendChat = (content: string) => {
    if (!content.trim()) return;

    sendWS("CHAT", {
      userName: userNameRef.current,
      content,
      senderId: userIdRef.current,
    });
  };

  const approveJoin = (targetUserId: string) => {
    sendWS("JOIN_APPROVE", {
      userId: targetUserId,
    });

    setJoinRequests((prev) =>
      prev.filter((req) => req.userId !== targetUserId)
    );
  };

  const rejectJoin = (targetUserId: string) => {
    sendWS("JOIN_REJECT", {
      userId: targetUserId,
    });

    setJoinRequests((prev) =>
      prev.filter((req) => req.userId !== targetUserId)
    );
  };

  // Bản thân rời phòng — phòng vẫn tồn tại cho người khác.
  const leaveRoom = () => {
    sendWS("LEAVE_ROOM", {
      userId: userIdRef.current,
    });

    socketRef.current?.close();
  };

  // Host kết thúc phòng — khác với leaveRoom, đóng cả phòng cho tất cả.
  const endRoom = () => {
    sendWS("END_ROOM", {
      userId: userIdRef.current,
    });

    socketRef.current?.close();
  };

  // ── Danh sách chờ bài hát ────────────────────────────────────────────
  // Server (queue_handler.go) tự quyết định trạng thái dựa vào người gửi:
  // host gửi -> vào "queued" luôn; người khác gửi -> vào "pending", chờ
  // host duyệt. Vì vậy chỉ cần 1 hàm requestSong() cho mọi vai trò.
  //
  // `id` nên được tạo phía client bằng crypto.randomUUID() trước khi gọi,
  // vì backend yêu cầu payload phải có id khác rỗng.
  const requestSong = (song: {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
  }) => {
    sendWS("QUEUE_REQUEST", song);
  };

  const approveSong = (id: string) => {
    sendWS("QUEUE_APPROVE", { id });
  };

  const rejectSong = (id: string) => {
    sendWS("QUEUE_REJECT", { id });
  };

  const removeFromQueue = (id: string) => {
    sendWS("QUEUE_REMOVE", { id });
  };

  const clearPendingQueue = () => {
    sendWS("QUEUE_CLEAR_PENDING", {});
  };

  return {
    userId,
    roomState,
    connected,
    messages,
    isLoading,
    waitingApproval,
    joinRequests,
    rejectedMessage,
    sendChat,
    needsInteraction,
    handleInteract,
    handlePlay,
    handlePause,
    handleSeek,
    approveJoin,
    rejectJoin,
    leaveRoom,
    endRoom,
    requestSong,
    approveSong,
    rejectSong,
    removeFromQueue,
    clearPendingQueue,
  };
}