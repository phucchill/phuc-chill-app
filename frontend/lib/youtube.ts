// lib/youtube.ts
// Helper thuần cho việc validate URL YouTube + gọi backend lấy metadata preview.

import { YoutubePreview } from "../types/upload";

const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYoutubeVideoId(url: string): string | null {
  const match = url.trim().match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

export function isValidYoutubeUrl(url: string): boolean {
  return extractYoutubeVideoId(url) !== null;
}

/**
 * Trả về link thumbnail mặc định của YouTube dựng THẲNG từ videoId — không
 * cần gọi mạng, dùng để auto-fill ô "Link ảnh đại diện" ngay lập tức khi
 * người dùng vừa dán link hợp lệ (trước khi backend kịp trả oEmbed).
 * Người dùng vẫn có thể sửa lại ô này nếu muốn dùng ảnh khác.
 */
export function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Gọi backend để lấy metadata video (title, channel, thumbnail, duration nếu có).
 * Backend contract (xem backend/youtube_handler.go):
 *   POST {apiBase}/api/youtube/preview
 *   body: { url: string }
 *   response: { videoId, url, title, channel, thumbnail, duration? }
 */
export async function fetchYoutubePreview(
  url: string,
  apiBase: string
): Promise<YoutubePreview> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error("Link YouTube không hợp lệ");
  }

  const res = await fetch(`${apiBase}/api/youtube/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    let message = "Không thể lấy thông tin video";
    try {
      const errData = await res.json();
      if (errData?.error) message = errData.error;
    } catch {
      /* ignore parse error */
    }
    throw new Error(message);
  }

  return res.json();
}

export function formatYoutubeDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}