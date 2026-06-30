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

// ─── Music Room queue ─────────────────────────────────────────────────────────

export interface QueueSong {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
  status: "pending" | "queued";
  requestedBy?: string;
  requestedByName?: string;
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

  // KTV mic
  activeMicUid?: string;
  activeMicName?: string;
  micRequests?: MicRequest[];
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

  // Music Room queue
  | "QUEUE_REQUEST"       // thêm bài (host → queued, member → pending)
  | "QUEUE_APPROVE"       // host duyệt bài đang pending
  | "QUEUE_REJECT"        // host từ chối bài đang pending
  | "QUEUE_REMOVE"        // xóa bài đã queued
  | "QUEUE_CLEAR_PENDING" // host xóa hết bài đang pending
  | "QUEUE_UPDATE"        // server broadcast danh sách mới

  // KTV — queue
  | "SONG_QUEUE_ADD"
  | "SONG_QUEUE_REMOVE"
  | "SONG_QUEUE_NEXT"
  | "SONG_QUEUE_UPDATE"

  // KTV — mic
  | "MIC_REQUEST"
  | "MIC_APPROVE"
  | "MIC_REJECT"
  | "MIC_RELEASE"

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