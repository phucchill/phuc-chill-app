"use client";

import { useEffect, useState } from "react";
import { Music } from "lucide-react";
import Button from "../components/ui/Button";

interface SongMetadataFormProps {
  initialTitle?: string;
  initialArtist?: string;
  initialThumbnail?: string;
  /** vd "3:45" — chỉ hiển thị, không cho sửa */
  durationLabel?: string;
  /** vd "YouTube" | "File tải lên" */
  sourceLabel: string;
  onConfirm: (values: { title: string; artist: string; thumbnail: string }) => void;
  onCancel: () => void;
}

export default function SongMetadataForm({
  initialTitle = "",
  initialArtist = "",
  initialThumbnail = "",
  durationLabel,
  sourceLabel,
  onConfirm,
  onCancel,
}: SongMetadataFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);
  const [thumbnail, setThumbnail] = useState(initialThumbnail);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Cho phép component cha re-init form khi chuyển sang review 1 bài khác
  // (vd nhiều file upload cùng lúc, xét lần lượt từng file).
  useEffect(() => {
    setTitle(initialTitle);
    setArtist(initialArtist);
    setThumbnail(initialThumbnail);
    setThumbnailError(false);
  }, [initialTitle, initialArtist, initialThumbnail]);

  const canConfirm = title.trim().length > 0;

  const inputClass =
    "rounded-input border border-border bg-white/5 px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-key";

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-white/[0.04] p-4">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-input bg-surface-strong">
          {thumbnail && !thumbnailError ? (
            <img
              src={thumbnail}
              alt=""
              onError={() => setThumbnailError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <Music size={18} strokeWidth={2} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] uppercase tracking-wide text-text-muted">
            {sourceLabel}
            {durationLabel ? ` · ${durationLabel}` : ""}
          </p>
          <p className="m-0 mt-0.5 text-[13px] text-text-secondary">
            Kiểm tra lại thông tin trước khi thêm vào hàng chờ
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Tên bài hát</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên bài hát" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Nghệ sĩ</span>
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Tên nghệ sĩ (không bắt buộc)"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">Link ảnh đại diện</span>
        <input
          value={thumbnail}
          onChange={(e) => {
            setThumbnail(e.target.value);
            setThumbnailError(false);
          }}
          placeholder="https://..."
          className={inputClass}
        />
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button
          variant="primary"
          disabled={!canConfirm}
          onClick={() =>
            canConfirm &&
            onConfirm({
              title: title.trim(),
              artist: artist.trim(),
              thumbnail: thumbnail.trim(),
            })
          }
        >
          Thêm vào hàng chờ
        </Button>
      </div>
    </div>
  );
}