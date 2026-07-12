"use client";

import { motion } from "framer-motion";
import { AlertCircle, Check, Music2, X } from "lucide-react";
import { UploadFileMeta } from "../types/upload";

interface UploadProgressProps {
  files: UploadFileMeta[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}

function formatDuration(seconds?: number) {
  if (!seconds || isNaN(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function UploadProgress({ files, onRemove, onRetry }: UploadProgressProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {files.map((f) => (
        <div
          key={f.localId}
          className="flex items-center gap-3 rounded-input border border-divider bg-white/[0.03] px-3 py-2.5"
        >
          {/* Album cover placeholder */}
          <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-surface-strong">
            {f.status === "success" ? (
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                <Check size={18} className="text-key" strokeWidth={2.5} />
              </motion.div>
            ) : f.status === "error" ? (
              <AlertCircle size={16} className="text-key" strokeWidth={2} />
            ) : (
              <Music2 size={16} className="text-text-muted" strokeWidth={2} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[13px] font-medium text-text-primary">{f.fileName}</p>
            <p className="m-0 text-[11px] text-text-muted">
              {f.fileSizeLabel} · {formatDuration(f.duration)}
            </p>

            {(f.status === "uploading" || f.status === "reading") && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-key transition-[width] duration-200"
                  style={{ width: `${f.status === "reading" ? 5 : f.progress}%` }}
                />
              </div>
            )}

            {f.status === "error" && <p className="m-0 mt-1 text-[11px] text-key">{f.error}</p>}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {f.status === "success" && (
              <span className="text-[11px] text-text-muted">Đã thêm vào hàng chờ</span>
            )}
            {f.status === "error" && (
              <button
                onClick={() => onRetry(f.localId)}
                className="cursor-pointer rounded-button border border-border bg-white/5 px-2.5 py-1 text-[11px] text-text-secondary hover:bg-white/10"
              >
                Thử lại
              </button>
            )}
            <button
              onClick={() => onRemove(f.localId)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-divider bg-transparent text-text-muted hover:bg-white/5"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}