// types/youtubePlayer.ts
// Kiểu dữ liệu cho việc điều khiển YouTube IFrame Player — dùng chung giữa
// MusicPlayer.tsx (nơi mount iframe thật) và useRoomSocket.ts (nơi gọi
// play/pause/seek để đồng bộ cả phòng, thay cho thẻ <audio> khi bài hiện
// tại là link YouTube).

export interface YoutubePlayerHandle {
  youtube: {
    isReady: () => boolean;
    /** videoId 11 ký tự (KHÔNG phải URL đầy đủ) */
    playVideo: (videoId: string, startSeconds?: number) => void;
    pauseVideo: () => void;
    seekTo: (seconds: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    /** 0-100 (thang của chính YouTube IFrame API, khác thang 0-1 của <audio>) */
    setVolume: (volumePercent: number) => void;
  };
}

export interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volumePercent: number) => void;
  getVolume: () => number;
  // mute()/unMute(): dùng cho "mute-trick" bypass chính sách autoplay của
  // trình duyệt — playVideo() gọi từ postMessage KHÔNG gắn với 1 click
  // trực tiếp của user (vd đồng bộ qua ROOM_STATE khi host bấm Next/Prev)
  // sẽ bị chặn autoplay có tiếng trong iframe (khác-origin youtube.com).
  // Autoplay Ở CHẾ ĐỘ TẮT TIẾNG luôn được phép vô điều kiện, nên mute()
  // ngay trước playVideo() rồi unMute() lại sau khi đã bắt đầu phát —
  // xem MusicPlayer.tsx.
  mute: () => void;
  unMute: () => void;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
}

// Khai báo tối thiểu cho window.YT — YouTube IFrame API không có type
// chính thức trong dự án, khai báo tay để tránh lỗi TypeScript "any".
declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          width?: string | number;
          height?: string | number;
          videoId?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}