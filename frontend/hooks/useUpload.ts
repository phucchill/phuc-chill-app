"use client";

import { useCallback, useRef, useState } from "react";
import {
  formatFileSize,
  readAudioDuration,
  uploadAudioFile,
  validateAudioFile,
} from "../lib/upload";
import { QueueSongInput, UploadFileMeta } from "../types/upload";

interface UseUploadOptions {
  apiBase: string;
  /** tên hiển thị của người đang thao tác, dùng cho trường "addedBy" */
  currentUserName?: string;
  /** gọi khi 1 file upload xong -> đẩy thẳng vào hàng chờ */
  onUploaded: (song: QueueSongInput) => void;
}

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `upload-${Date.now()}-${localIdCounter}`;
}

export function useUpload({ apiBase, currentUserName, onUploaded }: UseUploadOptions) {
  const [files, setFiles] = useState<UploadFileMeta[]>([]);
  const filesRef = useRef<UploadFileMeta[]>([]);
  filesRef.current = files;

  const patchFile = useCallback((localId: string, patch: Partial<UploadFileMeta>) => {
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  }, []);

  const runUpload = useCallback(
    async (meta: UploadFileMeta) => {
      patchFile(meta.localId, { status: "uploading", progress: 0 });
      try {
        const result = await uploadAudioFile(meta.file, apiBase, {
          duration: meta.duration,
          onProgress: (percent) => patchFile(meta.localId, { progress: percent }),
        });

        patchFile(meta.localId, {
          status: "success",
          progress: 100,
          songSrc: result.songSrc,
        });

        onUploaded({
          id: nextLocalId(),
          title: result.title || meta.fileName.replace(/\.[^/.]+$/, ""),
          artist: currentUserName ? `Tải lên bởi ${currentUserName}` : undefined,
          thumbnail: undefined,
          duration: result.duration ?? meta.duration,
          songSrc: result.songSrc,
          source: "upload",
          addedBy: currentUserName,
        });
      } catch (err) {
        patchFile(meta.localId, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload thất bại",
        });
      }
    },
    [apiBase, currentUserName, onUploaded, patchFile]
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);

      for (const file of incoming) {
        const validation = validateAudioFile(file);
        const localId = nextLocalId();

        const meta: UploadFileMeta = {
          localId,
          file,
          fileName: file.name,
          fileSizeLabel: formatFileSize(file.size),
          progress: 0,
          status: validation.valid ? "reading" : "error",
          error: validation.valid ? undefined : validation.error,
        };

        setFiles((prev) => [...prev, meta]);

        if (!validation.valid) continue;

        // Đọc duration ở client trước khi upload để hiển thị ngay trên UI
        const duration = await readAudioDuration(file);
        patchFile(localId, { duration, status: "idle" });

        void runUpload({ ...meta, duration });
      }
    },
    [patchFile, runUpload]
  );

  const removeFile = useCallback((localId: string) => {
    setFiles((prev) => prev.filter((f) => f.localId !== localId));
  }, []);

  const retryFile = useCallback(
    (localId: string) => {
      const meta = filesRef.current.find((f) => f.localId === localId);
      if (meta) void runUpload(meta);
    },
    [runUpload]
  );

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== "success"));
  }, []);

  return { files, addFiles, removeFile, retryFile, clearCompleted };
}