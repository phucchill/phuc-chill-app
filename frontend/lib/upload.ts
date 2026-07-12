// lib/upload.ts
// Helper thuần cho việc validate + upload file nhạc local lên backend.
// Không phụ thuộc React, dùng được ở bất kỳ hook/component nào.

import { ALLOWED_AUDIO_EXTENSIONS, AllowedAudioExtension } from "../types/upload";

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

function getExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export function isAllowedAudioExtension(ext: string): ext is AllowedAudioExtension {
  return (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

export function validateAudioFile(file: File): UploadValidationResult {
  const ext = getExtension(file.name);

  if (!isAllowedAudioExtension(ext)) {
    return {
      valid: false,
      error: `Định dạng .${ext || "?"} không được hỗ trợ. Chỉ nhận: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")}`,
    };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      error: `File vượt quá ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)} cho phép`,
    };
  }

  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Đọc duration ở client bằng thẻ <audio> ẩn, không cần upload trước */
export function readAudioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = "metadata";

      const cleanup = () => {
        URL.revokeObjectURL(url);
      };

      audio.onloadedmetadata = () => {
        const d = isFinite(audio.duration) ? audio.duration : undefined;
        cleanup();
        resolve(d);
      };
      audio.onerror = () => {
        cleanup();
        resolve(undefined);
      };
      audio.src = url;
    } catch {
      resolve(undefined);
    }
  });
}

export interface UploadAudioResult {
  songSrc: string;
  duration?: number;
  title?: string;
}

/**
 * Upload 1 file nhạc lên backend qua XMLHttpRequest (để lấy progress %).
 * Backend contract (xem backend/upload_handler.go):
 *   POST {apiBase}/api/upload  (multipart/form-data)
 *   fields: file, duration (optional, giây), title (optional)
 *   response: { songSrc: string, duration?: number, title?: string }
 */
export function uploadAudioFile(
  file: File,
  apiBase: string,
  opts: {
    duration?: number;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<UploadAudioResult> {
  return new Promise((resolve, reject) => {
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      reject(new Error(validation.error));
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (opts.duration) formData.append("duration", String(Math.round(opts.duration)));
    formData.append("title", file.name.replace(/\.[^/.]+$/, ""));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/api/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (err) {
          reject(new Error("Phản hồi từ server không hợp lệ"));
        }
      } else {
        let message = `Upload thất bại (${xhr.status})`;
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData?.error) message = errData.error;
        } catch {
          /* ignore parse error */
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi kết nối khi upload"));

    xhr.send(formData);
  });
}