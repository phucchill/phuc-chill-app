// types/upload.ts
// Các kiểu dữ liệu dùng chung cho tính năng "Thêm bài hát" (Search / Upload / YouTube)

export type SongSource = "library" | "upload" | "youtube";

export const ALLOWED_AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "ogg",
] as const;

export type AllowedAudioExtension = (typeof ALLOWED_AUDIO_EXTENSIONS)[number];

/** Trạng thái của 1 file đang được người dùng upload trong UploadDropzone/UploadProgress */
export interface UploadFileMeta {
  /** id nội bộ dùng để track trong danh sách, KHÔNG phải id bài hát cuối cùng */
  localId: string;
  file: File;
  fileName: string;
  fileSizeLabel: string;
  /** giây, lấy từ metadata audio ở client trước khi upload */
  duration?: number;
  progress: number; // 0 - 100
  status: "idle" | "reading" | "uploading" | "success" | "error";
  error?: string;
  /** kết quả server trả về sau khi upload xong */
  songSrc?: string;
}

/** Kết quả preview 1 video YouTube, hiển thị trong SongPreviewCard */
export interface YoutubePreview {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string;
  /** giây — có thể undefined nếu backend chỉ dùng oEmbed (oEmbed không trả duration) */
  duration?: number;
}

/** Payload chuẩn hoá để đẩy vào hàng chờ, dùng chung cho cả 3 tab */
export interface QueueSongInput {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
  songSrc: string;
  source: SongSource;
  addedBy?: string;
}

/** Quyền phòng — Host cấu hình trong Room Settings */
export interface RoomPermissions {
  onlyHostCanAdd: boolean;
  membersCanUpload: boolean;
  membersCanYoutube: boolean;
  membersCanSearch: boolean;
  autoApproveUploads: boolean;
}

export const DEFAULT_ROOM_PERMISSIONS: RoomPermissions = {
  onlyHostCanAdd: false,
  membersCanUpload: true,
  membersCanYoutube: true,
  membersCanSearch: true,
  autoApproveUploads: false,
};