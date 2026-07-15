import type { RoomPermissions, SongSource } from "./upload";

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt?: number;
  role?: "host" | "mic" | "viewer";
}

export interface MicRequest {
  userId: string;
  userName: string;
  requestedAt: number;
}

// ─── KTV: Mic Slot (6 ghế cố định) ──────────────────────────────────────────────
// Khớp model.MicSlot bên Go. Ghế trống → null trong mảng 6 phần tử.
export interface MicSlot {
  index: number;
  userId: string;
  userName: string;
  cameraOn: boolean;
  isSpeaking: boolean;
  giftScore: number;
  joinedAt: number;
}

export type MicSlotArray = (MicSlot | null)[]; // luôn có độ dài 6

// ─── KTV: Room Mode ─────────────────────────────────────────────────────────────
export type RoomMode = "lounge" | "performance" | "pk";

// ─── KTV: Performance (Spotlight) ────────────────────────────────────────────────
export interface Performance {
  singerId: string;
  singerName: string;
  songTitle: string;
  songArtist: string;
  lyrics?: string;        // MỚI — khớp model.Performance.Lyrics bên Go
  albumCoverUrl?: string;
  startedAt: number;
  likes: number;
  giftScore: number;
}

// ─── KTV: Room Memory & Top Singer (chỉ trong phạm vi phòng, reset khi đóng phòng) ──
export interface RoomMemoryEntry {
  songTitle: string;
  songArtist: string;
  singerId: string;
  singerName: string;
  durationSec: number;
  likes: number;
  giftScore: number;
  audienceCount: number;
  timestamp: number;
}

export interface TopSingerStats {
  userId: string;
  userName: string;
  songsSung: number;
  totalGifts: number;
  totalLikes: number;
  pkWins: number;
}

// ─── Music Room queue (KHÔNG đổi — giữ nguyên logic phòng nghe nhạc chính) ───────

export interface QueueSong {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
  status: "pending" | "queued";
  requestedBy?: string;
  requestedByName?: string;
  songSrc?: string;
  source?: SongSource;
}

// ─── Room state ───────────────────────────────────────────────────────────────

export interface RoomState {
  roomId: string;
  hostId: string;

  roomType?: "music" | "ktv";
  privacy?: "public" | "private";
  maxUsers?: number;

  currentSong: string;
  isPlaying: boolean;
  progress: number;

  participants: Participant[];

  songTitle?: string;
  songArtist?: string;
  songCover?: string;

  // Music Room queue
  queueSongs?: QueueSong[];

  permissions?: RoomPermissions;

  shuffleEnabled?: boolean;
  repeatMode?: "off" | "one" | "all";
  currentSongLiked?: boolean;

  // KTV — legacy field, giữ lại để không vỡ code cũ đang tham chiếu (nếu có).
  // Component mới nên dùng `micSlots` thay vì `activeMicUid`.
  activeMicUid?: string;
  activeMicName?: string;
  micRequests?: MicRequest[];

  // KTV — mới
  micSlots?: MicSlotArray;
  mode?: RoomMode;
  currentPerformance?: Performance | null;
  roomMemory?: RoomMemoryEntry[];
  topSingers?: TopSingerStats[];
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  _id?: string;
  id?: string;
  roomId?: string;
  senderId?: string;
  userName: string;
  content: string;
  createdAt?: string;
  timestamp?: number;
  isMine?: boolean;
}

export function msgKey(msg: ChatMessage): string {
  return msg._id ?? msg.id ?? `${msg.senderId}-${msg.timestamp ?? msg.createdAt}`;
}

// ─── WS message types ─────────────────────────────────────────────────────────

export type WSMessageType =
  | "ROOM_STATE"
  | "SYNC_PLAY"
  | "SYNC_PAUSE"
  | "SYNC_SEEK"
  | "SYNC_PROGRESS"
  | "CHAT"
  | "ERROR"
  | "JOIN"
  | "LEAVE"
  | "USER_JOINED"
  | "USER_LEFT"
  | "WAITING_APPROVAL"
  | "JOIN_APPROVED"
  | "JOIN_REJECTED"
  | "ROOM_FULL"
  | "ROOM_ENDED"
  | "JOIN_REQUEST"
  | "JOIN_APPROVE"
  | "JOIN_REJECT"
  | "LEAVE_ROOM"
  | "END_ROOM"

  // Music Room queue (KHÔNG đổi)
  | "QUEUE_REQUEST"
  | "QUEUE_APPROVE"
  | "QUEUE_REJECT"
  | "QUEUE_REMOVE"
  | "QUEUE_CLEAR_PENDING"
  | "QUEUE_UPDATE"
  | "QUEUE_REJECTED"
  | "QUEUE_REMOVED"
  | "PERMISSIONS_UPDATE"
  | "SHUFFLE_TOGGLE"
  | "REPEAT_MODE_UPDATE"
  | "SONG_LIKE_TOGGLE"
  | "PLAYER_NEXT"
  | "PLAYER_PREV"

  // KTV — queue
  | "SONG_QUEUE_ADD"
  | "SONG_QUEUE_REMOVE"
  | "SONG_QUEUE_NEXT"
  | "SONG_QUEUE_UPDATE"

  // KTV — mic (hàng chờ)
  | "MIC_REQUEST"
  | "MIC_APPROVE"
  | "MIC_REJECT"
  | "MIC_RELEASE"
  | "MIC_KICK"
  | "MIC_KICKED"
  | "MIC_SLOTS_UPDATE"

  // KTV — camera / speaking
  | "CAMERA_TOGGLE"
  | "SPEAKING_UPDATE"

  // KTV — room mode
  | "ROOM_MODE_UPDATE"

  // KTV — performance (spotlight)
  | "PERFORMANCE_START"
  | "PERFORMANCE_LIKE"
  | "PERFORMANCE_LIKE_UPDATE"
  | "PERFORMANCE_END"

  //ktv 
  | "REACTION_SEND"
  | "REACTION_BROADCAST"
  | "KICK_FROM_ROOM"
  | "KICKED_FROM_ROOM"

  // KTV — gift
  | "GIFT_SEND"
  | "GIFT_BROADCAST"

  // KTV — PK
  | "PK_CHALLENGE"
  | "PK_ACCEPT"
  | "PK_DECLINE"
  | "PK_VOTE"
  | "PK_SCORE_UPDATE"
  | "PK_RESULT"
  | "PK_END"

  // KTV — WebRTC signaling (relay-only qua server)
  | "WEBRTC_OFFER"
  | "WEBRTC_ANSWER"
  | "WEBRTC_ICE_CANDIDATE"

  // KTV — role
  | "ROLE_UPDATE";

export interface WSMessage {
  type: WSMessageType;
  roomId?: string;
  senderId?: string;
  timestamp?: number;
  payload: any;
}

// ─── KTV interfaces ───────────────────────────────────────────────────────────

export interface SongQueueItem {
  id: string;
  title: string;
  artist: string;
  songUrl: string;
  requestedBy: string;
  requestedByName: string;
  addedAt: number;
}

export interface GiftEvent {
  id: string;
  roomId?: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  giftType: string;
  giftEmoji: string;
  giftName: string;
  giftCost: number;
  quantity: number;
  addedToPK: boolean;
  giftScore: number;
  timestamp: number;
}

export interface PKState {
  isActive: boolean;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  challengerScore: number;
  opponentScore: number;
  endsAt: number;
  votedUsers: string[];
}

export interface PKResultPayload {
  challengerId: string;
  challengerName: string;
  challengerScore: number;
  challengerGiftScore: number;
  challengerVoteCount: number;
  opponentId: string;
  opponentName: string;
  opponentScore: number;
  opponentGiftScore: number;
  opponentVoteCount: number;
  winnerId: string;
  winnerName: string;
}

export interface RoleUpdatePayload {
  userId: string;
  role: "host" | "mic" | "viewer";
}

// ─── KTV — WebRTC signaling payloads ─────────────────────────────────────────────
export interface WebRTCSignalPayload {
  targetUserId: string; // bắt buộc — server relay dựa vào field này
  fromUserId?: string;  // server tự gắn, FE không cần set khi gửi đi
  sdp?: RTCSessionDescriptionInit; // dùng cho OFFER/ANSWER
  candidate?: RTCIceCandidateInit; // dùng cho ICE_CANDIDATE
}