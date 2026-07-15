// app/ktv/[roomId]/page.tsx
// ORCHESTRATOR — quản lý WebSocket, toàn bộ state từ ROOM_STATE, nối
// useWebRTC, chọn render Lounge/Performance/PK Mode.
//
// useWebRTC({ myUserId, peerUserIds, cameraOn, sendSignal }) trả về
// { localStream, remoteStreams, cameraError, handleSignal } — khớp đúng
// source thật của ktv/hooks/useWebRTC.ts:
//   - sendSignal(type, payload: WebRTCSignalPayload) — payload đã có sẵn
//     targetUserId/sdp/candidate, orchestrator chỉ cần forward qua sendWS
//   - handleSignal(type, payload: WebRTCSignalPayload) — gọi khi nhận
//     WEBRTC_OFFER/ANSWER/ICE_CANDIDATE từ server
//
// CẬP NHẬT so với bản trước:
//   - Reaction: giờ BROADCAST THẬT qua REACTION_SEND/REACTION_BROADCAST
//     (trước đây local-only)
//   - Kick khỏi phòng hẳn: đã wire qua KICK_FROM_ROOM/KICKED_FROM_ROOM
//   - Performance Mode: đã truyền lyrics/albumCoverUrl thật từ backend
//
// GIẢ ĐỊNH THIẾT KẾ còn lại (chưa xác nhận):
//   - RoomMemoryPanel: hiện dạng modal bật bằng nút trong header
//   - Song queue không được nạp lại từ ROOM_STATE ban đầu, chỉ cập nhật
//     qua SONG_QUEUE_UPDATE (khớp hành vi bản page.tsx KTV cũ)

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createSocket } from "@/lib/socket";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useAudio } from "@/hooks/useAudio";
import { useWebRTC } from "@/ktv/hooks/useWebRTC";
import { ktvTheme as T, springTransition } from "@/ktv/theme";
import LoungeMode from "@/ktv/components/LoungeMode";
import PerformanceMode from "@/ktv/components/PerformanceMode";
import PKMode from "@/ktv/components/PKMode";
import HostControls from "@/ktv/components/HostControls";
import RoomMemoryPanel from "@/ktv/components/RoomMemoryPanel";
import { FloatingReactions, type ActivityItem, type FloatingReactionEntry } from "@/ktv/components/SocialPanel";
import type {
  RoomState,
  WSMessage,
  MicSlotArray,
  MicRequest,
  RoomMode,
  Performance,
  RoomMemoryEntry,
  TopSingerStats,
  SongQueueItem,
  PKState,
  PKResultPayload,
  WebRTCSignalPayload,
} from "@/types/websocket";

const EMPTY_MIC_SLOTS: MicSlotArray = new Array(6).fill(null);

export default function KTVPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const userIdRef = useRef("");
  const userNameRef = useRef("");
  const msgRef = useRef<(d: WSMessage) => void>(null!);

  const [userId, setUserId] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [joinReqs, setJoinReqs] = useState<{ userId: string; userName: string }[]>([]);

  // ── KTV state mới ──
  const [micSlots, setMicSlots] = useState<MicSlotArray>(EMPTY_MIC_SLOTS);
  const [micRequests, setMicRequests] = useState<MicRequest[]>([]);
  const [mode, setMode] = useState<RoomMode>("lounge");
  const [currentPerformance, setCurrentPerformance] = useState<Performance | null>(null);
  const [roomMemory, setRoomMemory] = useState<RoomMemoryEntry[]>([]);
  const [topSingers, setTopSingers] = useState<TopSingerStats[]>([]);
  const [queue, setQueue] = useState<SongQueueItem[]>([]);
  const [pkState, setPkState] = useState<PKState | null>(null);
  const [pkResult, setPkResult] = useState<PKResultPayload | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReactionEntry[]>([]);

  // ── UI toggles ──
  const [showHostDrawer, setShowHostDrawer] = useState(false);
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);

  const { needsInteraction, syncPlay, syncPause, syncSeek, handleInteract } = useAudio(audioRef);
  const { messages, isLoading: isLoadingChat, appendMessage } = useChatHistory({
    roomId,
    currentUserId: userId,
    apiBase: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
  });

  const isHost = roomState?.hostId === userId;
  const participants = roomState?.participants ?? [];

  const myCameraOn = useMemo(
    () => micSlots.find((s) => s?.userId === userId)?.cameraOn ?? false,
    [micSlots, userId]
  );

  // ── gom activity feed (tối đa 50 item) ──
  const pushActivity = useCallback((icon: string, text: string) => {
    setActivityItems((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, icon, text, timestamp: Date.now() }];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  const sendWS = useCallback(
    (type: string, payload: unknown) => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) return;
      socketRef.current.send(JSON.stringify({ type, roomId, payload }));
    },
    [roomId]
  );

  const iAmOnMic = useMemo(() => micSlots.some((s) => s?.userId === userId), [micSlots, userId]);

  // ── WebRTC mesh — peer phụ thuộc vai trò ──
  // Đang giữ mic: kết nối tới TOÀN BỘ người trong phòng (broadcast camera
  // của mình cho cả khán giả lẫn mic khác). Khán giả: chỉ cần kết nối tới
  // những người đang giữ mic (chỉ nhận, không publish gì) — không cần nối
  // với khán giả khác vì không có media để trao đổi.
  const peerUserIds = useMemo(() => {
    if (iAmOnMic) {
      return participants.filter((p) => p.id !== userId).map((p) => p.id);
    }
    return micSlots.filter((s): s is NonNullable<typeof s> => !!s && s.userId !== userId).map((s) => s.userId);
  }, [micSlots, participants, userId, iAmOnMic]);

  
  // Khớp đúng chữ ký thật của useWebRTC.ts: sendSignal(type, payload) — payload
  // đã có sẵn targetUserId/sdp/candidate, chỉ cần forward nguyên vẹn qua sendWS.
  const sendSignal = useCallback(
    (type: "WEBRTC_OFFER" | "WEBRTC_ANSWER" | "WEBRTC_ICE_CANDIDATE", payload: WebRTCSignalPayload) => {
      sendWS(type, payload);
    },
    [sendWS]
  );

  const { localStream, remoteStreams, handleSignal } = useWebRTC({
    myUserId: userId,
    peerUserIds,
    cameraOn: myCameraOn,
    sendSignal,
  });

  /* ── message handler — ref pattern để tránh stale closure trong ws.onmessage ── */
  useEffect(() => {
    msgRef.current = (data: WSMessage) => {
      const p = typeof data.payload === "string" ? JSON.parse(data.payload) : data.payload;

      switch (data.type) {
        // ── Join / room lifecycle ──
        case "WAITING_APPROVAL":
          setWaiting(true);
          break;
        case "JOIN_APPROVED":
          setWaiting(false);
          break;
        case "JOIN_REJECTED":
          localStorage.setItem("room_notification", "Bạn đã bị host từ chối vào phòng");
          socketRef.current?.close();
          router.push("/rooms");
          break;
        case "ROOM_FULL":
          alert(p.message || "Phòng đã đầy");
          socketRef.current?.close();
          break;
        case "ROOM_ENDED":
          localStorage.setItem("room_notification", p?.message || "Phòng đã được host kết thúc");
          socketRef.current?.close();
          router.push("/");
          break;
        case "KICKED_FROM_ROOM":
          localStorage.setItem("room_notification", p?.message || "Bạn đã bị host mời ra khỏi phòng");
          socketRef.current?.close();
          router.push("/rooms");
          break;
        case "JOIN_REQUEST":
          setJoinReqs((prev) => (prev.some((r) => r.userId === p.userId) ? prev : [...prev, { userId: p.userId, userName: p.userName || "Khách" }]));
          break;

        // ── Room state đầy đủ ──
        case "ROOM_STATE": {
          const state = p as RoomState;
          setWaiting(false);
          setRoomState(state);
          setMicSlots(state.micSlots ?? EMPTY_MIC_SLOTS);
          setMicRequests(state.micRequests ?? []);
          setMode(state.mode ?? "lounge");
          setCurrentPerformance(state.currentPerformance ?? null);
          setRoomMemory(state.roomMemory ?? []);
          setTopSingers(state.topSingers ?? []);

          if (state.isPlaying) {
            setTimeout(() => void syncPlay(state.currentSong || "", state.progress || 0), 300);
          } else {
            syncPause(state.progress || 0);
          }
          break;
        }

        // ── Playback nhạc nền ──
        case "SYNC_PLAY":
          void syncPlay(p.songId || "", p.progress || 0);
          setRoomState((prev) => (prev ? { ...prev, currentSong: p.songId || prev.currentSong, isPlaying: true } : prev));
          break;
        case "SYNC_PAUSE":
          syncPause(p.progress || 0);
          setRoomState((prev) => (prev ? { ...prev, isPlaying: false } : prev));
          break;
        case "SYNC_SEEK":
          syncSeek(p.progress || 0);
          break;
        case "SYNC_PROGRESS":
          setRoomState((prev) =>
            prev ? { ...prev, currentSong: p.songId || prev.currentSong, isPlaying: p.isPlaying, progress: p.progress || 0 } : prev
          );
          break;

        // ── Chat ──
        case "CHAT": {
          const senderId = data.senderId ?? p.senderId ?? "";
          appendMessage({
            id: p.id ?? p._id,
            roomId,
            senderId,
            userName: p.userName || "Ẩn danh",
            content: p.content || "",
            timestamp: data.timestamp ?? p.timestamp ?? Date.now(),
            createdAt: p.createdAt,
            isMine: senderId === userIdRef.current,
          });
          break;
        }

        // ── Song queue ──
        case "SONG_QUEUE_UPDATE":
          setQueue(p.queue || []);
          break;

        // ── Mic requests (hàng chờ) ──
        case "MIC_REQUEST":
          setMicRequests((prev) => (prev.some((r) => r.userId === p.userId) ? prev : [...prev, { userId: p.userId, userName: p.userName, requestedAt: p.requestedAt || Date.now() }]));
          break;
        case "MIC_REJECT":
          if (p.userId === userIdRef.current) alert(p.message || "Host đã từ chối yêu cầu mic của bạn");
          setMicRequests((prev) => prev.filter((r) => r.userId !== p.userId));
          break;
        case "MIC_KICKED":
          if (p.message) alert(p.message);
          break;

        // ── Mic slots (6 ghế) — nguồn sự thật chính cho ai đang giữ mic ──
        case "MIC_SLOTS_UPDATE": {
          const slots = (p.slots || EMPTY_MIC_SLOTS) as MicSlotArray;
          setMicSlots(slots);
          setMicRequests((prev) => prev.filter((r) => !slots.some((s) => s?.userId === r.userId)));
          break;
        }

        // ── Room mode ──
        case "ROOM_MODE_UPDATE":
          setMode(p.mode as RoomMode);
          if (p.mode !== "pk") {
            setPkState(null);
          }
          break;

        // ── Performance (spotlight) ──
        case "PERFORMANCE_START":
          setCurrentPerformance({
            singerId: p.singerId,
            singerName: p.singerName,
            songTitle: p.songTitle,
            songArtist: p.songArtist,
            lyrics: p.lyrics || undefined,
            albumCoverUrl: p.albumCoverUrl || undefined,
            startedAt: Date.now(),
            likes: 0,
            giftScore: 0,
          });
          pushActivity("🎵", `${p.singerName} bắt đầu hát "${p.songTitle}"`);
          break;
        case "PERFORMANCE_LIKE_UPDATE":
          setCurrentPerformance((prev) => (prev ? { ...prev, likes: p.likes } : prev));
          break;
        case "PERFORMANCE_END": {
          const entry = p as RoomMemoryEntry;
          setCurrentPerformance(null);
          setRoomMemory((prev) => [...prev, entry]);
          pushActivity("🏁", `${entry.singerName} đã hát xong "${entry.songTitle}"`);
          break;
        }

        // ── Gift ──
        case "GIFT_BROADCAST":
          pushActivity(p.giftEmoji || "🎁", `${p.fromUserName} tặng ${p.giftName} cho ${p.toUserName}`);
          break;

        // ── Reaction — broadcast thật ──
        case "REACTION_BROADCAST": {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setFloatingReactions((prev) => [...prev, { id, emoji: p.emoji }]);
          setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2200);
          if (p.fromUserId !== userIdRef.current) {
            pushActivity(p.emoji, `${p.fromUserName} đã thả reaction`);
          }
          break;
        }

        // ── PK ──
        case "PK_CHALLENGE":
          setPkState({
            isActive: true,
            challengerId: p.challengerId,
            challengerName: p.challengerName,
            opponentId: p.opponentId,
            opponentName: p.opponentName,
            challengerScore: 0,
            opponentScore: 0,
            endsAt: p.endsAt || Date.now() + 60000,
            votedUsers: [],
          });
          setPkResult(null);
          pushActivity("⚔️", `${p.challengerName} thách đấu ${p.opponentName}`);
          break;
        case "PK_VOTE":
        case "PK_SCORE_UPDATE":
          setPkState((prev) =>
            prev
              ? {
                  ...prev,
                  challengerScore: p.challengerScore ?? prev.challengerScore,
                  opponentScore: p.opponentScore ?? prev.opponentScore,
                  votedUsers: p.voterId ? [...prev.votedUsers, p.voterId] : prev.votedUsers,
                }
              : prev
          );
          break;
        case "PK_RESULT":
          setPkResult(p as PKResultPayload);
          pushActivity("🏆", `${p.winnerName} thắng trận PK!`);
          break;

        // ── Role ──
        case "ROLE_UPDATE":
          // Không cần state riêng — vai trò suy ra trực tiếp từ micSlots/hostId
          break;

        // ── WebRTC signaling — relay-only, media đi P2P giữa các client ──
        case "WEBRTC_OFFER":
        case "WEBRTC_ANSWER":
        case "WEBRTC_ICE_CANDIDATE":
          void handleSignal(data.type as "WEBRTC_OFFER" | "WEBRTC_ANSWER" | "WEBRTC_ICE_CANDIDATE", p as WebRTCSignalPayload);
          break;

        case "ERROR":
          alert(p.message || "Có lỗi xảy ra");
          break;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, appendMessage, syncPlay, syncPause, syncSeek, pushActivity, handleSignal]);

  /* ── khởi tạo WebSocket ── */
  useEffect(() => {
    let id = localStorage.getItem("userId");
    const name = localStorage.getItem("userName") || "Khách";
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("userId", id);
    }
    userIdRef.current = id;
    userNameRef.current = name;
    setUserId(id);

    const ws = createSocket({ roomId, userId: id, userName: name, roomType: "ktv" });
    socketRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev: MessageEvent) => {
      for (const line of (ev.data as string).split("\n").map((l: string) => l.trim()).filter(Boolean)) {
        try {
          msgRef.current(JSON.parse(line));
        } catch {
          // bỏ qua dòng lỗi parse, không crash cả socket
        }
      }
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /* ── actions: mic ── */
  const onRequestMic = () => sendWS("MIC_REQUEST", { userId: userIdRef.current, userName: userNameRef.current });
  const onApproveMic = (uid: string, uname: string) => sendWS("MIC_APPROVE", { userId: uid, userName: uname });
  const onRejectMic = (uid: string) => sendWS("MIC_REJECT", { userId: uid });
  const onKickMic = (uid: string) => sendWS(uid === userIdRef.current ? "MIC_RELEASE" : "MIC_KICK", { userId: uid });
  const onToggleMyCamera = (on: boolean) => sendWS("CAMERA_TOGGLE", { on });

  /* ── actions: kick khỏi phòng hẳn (khác gỡ mic) ── */
  const onKickFromRoom = (uid: string) => sendWS("KICK_FROM_ROOM", { userId: uid });

  /* ── actions: song queue ── */
  const onAddSong = (song: { title: string; artist: string; url: string }) =>
    sendWS("SONG_QUEUE_ADD", {
      id: crypto.randomUUID(),
      title: song.title,
      artist: song.artist,
      url: song.url,
      requestedBy: userIdRef.current,
      requestedByName: userNameRef.current,
    });
  const onRemoveSong = (id: string) => sendWS("SONG_QUEUE_REMOVE", { id });
  const onNextSong = () => sendWS("SONG_QUEUE_NEXT", {});

  /* ── actions: playback nhạc nền ── */
  const handlePlayToggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (roomState?.isPlaying) {
      a.pause();
      sendWS("SYNC_PAUSE", { songId: roomState?.currentSong, progress: a.currentTime, isPlaying: false });
      setRoomState((prev) => (prev ? { ...prev, isPlaying: false } : prev));
    } else {
      try {
        await a.play();
        sendWS("SYNC_PLAY", { songId: roomState?.currentSong, progress: a.currentTime, isPlaying: true });
        setRoomState((prev) => (prev ? { ...prev, isPlaying: true } : prev));
      } catch {
        alert("Không phát được nhạc.");
      }
    }
  };

  /* ── actions: gift ── */
  const onSendGift = (toUserId: string, toUserName: string, gift: { type: string; emoji: string; name: string; cost: number }) =>
    sendWS("GIFT_SEND", {
      fromUserId: userIdRef.current,
      fromUserName: userNameRef.current,
      toUserId,
      toUserName,
      giftType: gift.type,
      giftEmoji: gift.emoji,
      giftName: gift.name,
      giftCost: gift.cost,
      quantity: 1,
    });

  /* ── actions: performance ── */
  const onSpotlight = (
    singerId: string,
    singerName: string,
    songTitle: string,
    songArtist: string,
    lyrics?: string,
    albumCoverUrl?: string
  ) => sendWS("PERFORMANCE_START", { singerId, singerName, songTitle, songArtist, lyrics, albumCoverUrl });
  const onLike = () => sendWS("PERFORMANCE_LIKE", {});
  const onEndPerformance = () => sendWS("PERFORMANCE_END", {});

  /* ── actions: PK ── */
  const onStartPK = (opponentId: string, opponentName: string) =>
    sendWS("PK_CHALLENGE", {
      challengerId: userIdRef.current,
      challengerName: userNameRef.current,
      opponentId,
      opponentName,
      endsAt: Date.now() + 60000,
    });
  const onVote = (side: "challenger" | "opponent") => sendWS("PK_VOTE", { voterId: userIdRef.current, side });
  const onEndPK = () => sendWS("PK_END", {});

  /* ── actions: join approval (host duyệt người vào phòng) ── */
  const approveJoin = (uid: string) => {
    sendWS("JOIN_APPROVE", { userId: uid });
    setJoinReqs((prev) => prev.filter((r) => r.userId !== uid));
  };
  const rejectJoin = (uid: string) => {
    sendWS("JOIN_REJECT", { userId: uid });
    setJoinReqs((prev) => prev.filter((r) => r.userId !== uid));
  };

  /* ── actions: reaction — broadcast thật qua WS ── */
  const onSendReaction = (emoji: string) => sendWS("REACTION_SEND", { fromUserName: userNameRef.current, emoji });

  /* ── waiting screen ── */
  if (waiting) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: T.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          color: T.text,
          fontFamily: T.font,
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${T.keyLo}`, borderTopColor: T.key, animation: "spin 1s linear infinite" }} />
        <div style={{ fontSize: 20, fontWeight: 600 }}>Đang chờ host duyệt</div>
        <div style={{ fontSize: 13, color: T.textMid }}>Host cần chấp nhận bạn vào phòng</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div style={{ minHeight: "100vh", background: T.background, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMid, fontFamily: T.font }}>
        Đang kết nối phòng...
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.background, color: T.text, fontFamily: T.font, overflow: "hidden" }}>
      {/* ═══ HEADER ═══ */}
      <header
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "rgba(0,0,0,.3)",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/rooms")}
            style={{ padding: "5px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,.06)", border: `1px solid ${T.border}`, color: T.textMid }}
          >
            ← Rời phòng
          </button>
          <div style={{ width: 1, height: 20, background: T.border }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            🎤 KTV · <span style={{ color: T.key }}>{roomId}</span>
          </span>
          {isHost && (
            <span style={{ padding: "2px 9px", borderRadius: T.radiusPill, fontSize: 10, fontWeight: 600, background: T.keyLo, color: T.key, border: "1px solid rgba(226,65,84,.3)" }}>
              👑 Host
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {connected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.key, boxShadow: `0 0 6px ${T.keyGlow}` }} />}
          <span style={{ fontSize: 11, color: T.textLow }}>{participants.length} người</span>

          <button
            onClick={() => setShowMemoryDrawer(true)}
            style={{ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,.06)", border: `1px solid ${T.border}`, color: T.textMid }}
          >
            📀 Lịch sử
          </button>

          {isHost && (
            <button
              onClick={() => setShowHostDrawer((v) => !v)}
              style={{ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, background: showHostDrawer ? T.keyLo : "rgba(255,255,255,.06)", border: `1px solid ${showHostDrawer ? "rgba(226,65,84,.4)" : T.border}`, color: showHostDrawer ? T.key : T.textMid }}
            >
              👑 Quản lý
            </button>
          )}
        </div>
      </header>

      {/* ── join requests (host duyệt người vào phòng) ── */}
      {isHost && joinReqs.length > 0 && (
        <div style={{ padding: "8px 20px", background: "rgba(226,65,84,.06)", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.key, fontWeight: 600 }}>Yêu cầu vào phòng ({joinReqs.length}):</span>
          {joinReqs.map((r) => (
            <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: T.textMid }}>{r.userName}</span>
              <button onClick={() => approveJoin(r.userId)} style={{ padding: "3px 9px", borderRadius: 6, border: "none", cursor: "pointer", background: T.successLo, color: T.success, fontSize: 11 }}>✓</button>
              <button onClick={() => rejectJoin(r.userId)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(226,65,84,.12)", color: T.danger, fontSize: 11 }}>✗</button>
            </div>
          ))}
        </div>
      )}

      {/* ── autoplay nudge ── */}
      {needsInteraction && roomState.isPlaying && (
        <div style={{ padding: "8px 20px", background: T.keyLo, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: T.key }}>🎵 Phòng đang phát nhạc</span>
          <button onClick={handleInteract} style={{ padding: "6px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: T.key, color: "white", fontSize: 12, fontWeight: 600 }}>
            Nghe cùng
          </button>
        </div>
      )}

      {/* ═══ BODY — chuyển mode mượt bằng AnimatePresence ═══ */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden", display: "flex" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <AnimatePresence mode="wait">
            {mode === "pk" && pkState ? (
              <PKMode
                key="pk"
                pk={pkState}
                result={pkResult}
                onResultDismissed={() => setPkResult(null)}
                myUserId={userId}
                micSlots={micSlots}
                localStream={localStream}
                remoteStreams={remoteStreams}
                onVote={onVote}
              />
            ) : mode === "performance" && currentPerformance ? (
              <PerformanceMode
                key="performance"
                roomState={roomState}
                performance={currentPerformance}
                myUserId={userId}
                isHost={isHost}
                connected={connected}
                messages={messages}
                isLoadingChat={isLoadingChat}
                onSendChat={(content) => sendWS("CHAT", { userName: userNameRef.current, content, senderId: userIdRef.current })}
                activityItems={activityItems}
                micSlots={micSlots}
                localStream={localStream}
                remoteStreams={remoteStreams}
                myCameraOn={myCameraOn}
                onToggleMyCamera={onToggleMyCamera}
                onSendGift={onSendGift}
                onSendReaction={onSendReaction}
                onLike={onLike}
                onEndPerformance={onEndPerformance}
                lyrics={currentPerformance.lyrics ? currentPerformance.lyrics.split("\n") : undefined}
                albumCoverUrl={currentPerformance.albumCoverUrl}
              />
            ) : (
              <motion.div
                key="lounge"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                style={{ height: "100%" }}
              >
                <LoungeMode
                  roomState={roomState}
                  myUserId={userId}
                  isHost={isHost}
                  connected={connected}
                  messages={messages}
                  isLoadingChat={isLoadingChat}
                  onSendChat={(content) => sendWS("CHAT", { userName: userNameRef.current, content, senderId: userIdRef.current })}
                  activityItems={activityItems}
                  micSlots={micSlots}
                  localStream={localStream}
                  remoteStreams={remoteStreams}
                  myCameraOn={myCameraOn}
                  onRequestMic={onRequestMic}
                  onKickMic={onKickMic}
                  onToggleMyCamera={onToggleMyCamera}
                  queue={queue}
                  onAddSong={onAddSong}
                  onRemoveSong={onRemoveSong}
                  onSendGift={onSendGift}
                  onSendReaction={onSendReaction}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating reactions — Performance Mode tự có hiệu ứng bay giữa
              sân khấu riêng nên chỉ hiện overlay này ở Lounge/PK. */}
          {mode !== "performance" && (
            <FloatingReactions items={floatingReactions} style={{ right: 24, bottom: 90 }} />
          )}
        </div>

        {/* ═══ Host drawer — trượt ra từ phải ═══ */}
        <AnimatePresence>
          {isHost && showHostDrawer && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                width: 300,
                flexShrink: 0,
                borderLeft: `1px solid ${T.border}`,
                background: "rgba(0,0,0,.4)",
                backdropFilter: "blur(20px)",
                overflowY: "auto",
                padding: 16,
              }}
            >
              <HostControls
                isHost={isHost}
                mode={mode}
                micRequests={micRequests}
                onApproveMic={onApproveMic}
                onRejectMic={onRejectMic}
                micSlots={micSlots}
                onKickMic={onKickMic}
                onSpotlight={onSpotlight}
                queue={queue}
                onRemoveSong={onRemoveSong}
                onNextSong={onNextSong}
                isPlaying={roomState.isPlaying}
                onPlayToggle={handlePlayToggle}
                participants={participants}
                onKickFromRoom={onKickFromRoom}
                onStartPK={onStartPK}
                onEndPK={onEndPK}
                pkActive={mode === "pk"}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ Room Memory — modal bật bằng nút (giả định mặc định) ═══ */}
      <AnimatePresence>
        {showMemoryDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)", backdropFilter: "blur(12px)" }}
            onClick={() => setShowMemoryDrawer(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(520px, 92vw)", height: "min(640px, 84vh)", borderRadius: T.radiusCard, overflow: "hidden", border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}
            >
              <RoomMemoryPanel roomMemory={roomMemory} topSingers={topSingers} onClose={() => setShowMemoryDrawer(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio ref={audioRef} />
    </div>
  );
}