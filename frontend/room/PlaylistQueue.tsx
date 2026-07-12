"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, GripVertical, Search, Trash2, X } from "lucide-react";
import type { SongSource } from "../types/upload";
import { findSongBySrc } from "../lib/musicAPI";

/**
 * Một bài hát trong danh sách chờ.
 * - "pending": thành viên vừa request, đang chờ host duyệt
 * - "queued": đã được duyệt, đang nằm trong hàng chờ phát
 *
 * `source`/`requestedByName`/`songSrc` là optional để tương thích ngược —
 * nếu backend chưa trả về, UI vẫn chạy bình thường (chỉ đơn giản không
 * hiện badge nguồn / không lọc được theo thể loại cho bài đó).
 */
export interface QueueSong {
  id: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number; // giây
  status: "pending" | "queued";
  requestedBy?: string;
  /** Tên hiển thị của người request — server tự điền, không nhận từ client */
  requestedByName?: string;
  source?: SongSource;
  /** Đường dẫn file thật — dùng để tra thể loại (genre) từ musicAPI cho bộ lọc */
  songSrc?: string;
}

interface PlaylistQueueProps {
  songs: QueueSong[];
  isHost: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRemove?: (id: string) => void;
  onClearPending?: () => void;
}

const SOURCE_BADGE: Record<SongSource, string> = {
  library: "Thư viện",
  upload: "Tải lên",
  youtube: "YouTube",
};

const GENRES = ["Tất cả", "V-Pop", "Ballad", "Indie", "Dân Ca", "Bolero"];

const SOURCE_FILTERS: { key: SongSource; label: string }[] = [
  { key: "upload", label: "Tải lên" },
  { key: "youtube", label: "YouTube" },
];

function formatDuration(s?: number) {
  if (!s || isNaN(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function PlaylistQueue({
  songs,
  isHost,
  onApprove,
  onReject,
  onRemove,
  onClearPending,
}: PlaylistQueueProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Tất cả");
  /** null = không lọc theo nguồn (mặc định) — chọn 1 trong 2: Tải lên / YouTube */
  const [sourceFilter, setSourceFilter] = useState<SongSource | null>(null);

  const pendingCount = songs.filter((s) => s.status === "pending").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return songs.filter((song) => {
      const matchSearch =
        !q ||
        song.title.toLowerCase().includes(q) ||
        (song.artist ?? "").toLowerCase().includes(q);

      if (!matchSearch) return false;

      // Lọc theo nguồn (Tải lên / YouTube) — độc lập với lọc thể loại,
      // cả 2 điều kiện đều phải khớp nếu người dùng chọn cả hai.
      if (sourceFilter && song.source !== sourceFilter) return false;

      if (genre === "Tất cả") return true;

      // Chỉ bài nguồn "library" mới tra được thể loại qua musicAPI —
      // bài upload/YouTube không có genre nên sẽ không khớp filter thể
      // loại cụ thể (vẫn hiển thị khi genre = "Tất cả").
      const meta = song.songSrc ? findSongBySrc(song.songSrc) : undefined;
      return meta?.genre === genre;
    });
  }, [songs, search, genre, sourceFilter]);

  return (
    <div className="glass-card flex h-[420px] flex-col overflow-hidden rounded-card bg-surface/60">
      {/* Header (cố định, không scroll) */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-divider px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Hàng chờ
          </span>

          {songs.length > 0 && (
            <span className="rounded-full border border-border bg-white/5 px-2 py-0.5 text-[11px] text-text-secondary">
              {songs.length}
            </span>
          )}

          <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-[11px] text-text-muted">
            <Clock size={12} strokeWidth={2} />
            Chỉ host duyệt
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm bài hát hoặc ca sĩ..."
            className="w-full rounded-input border border-border bg-black/20 py-2 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-key"
          />
        </div>

        {/* Bộ lọc: thể loại + nguồn — gộp chung 1 hàng flex-wrap để tất cả
            chip cùng nằm 1 hàng trên desktop, chỉ tự xuống dòng khi không
            đủ chỗ (màn hình nhỏ). Logic/onClick của từng chip giữ nguyên
            như cũ, chỉ gộp chỗ đặt trong JSX. */}
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                genre === g
                  ? "border-key bg-key text-white"
                  : "border-border bg-white/[0.03] text-text-muted hover:text-text-secondary"
              }`}
            >
              {g}
            </button>
          ))}

          {SOURCE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSourceFilter((prev) => (prev === key ? null : key))}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                sourceFilter === key
                  ? "border-key bg-key text-white"
                  : "border-border bg-white/[0.03] text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách — vùng duy nhất được scroll, khung ngoài luôn giữ nguyên kích thước */}
      <div className="apple-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-[13px] text-text-muted">
            {songs.length === 0 ? "Chưa có bài hát nào trong hàng chờ" : "Không tìm thấy bài nào"}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((song, index) => {
              const isPending = song.status === "pending";
              const showRemove = !isPending && isHost && hoveredId === song.id;
              const badgeLabel = song.source ? SOURCE_BADGE[song.source] : null;
              const addedByLabel = song.requestedByName;

              return (
                <motion.div
                  key={song.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  onMouseEnter={() => setHoveredId(song.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="flex flex-shrink-0 items-center gap-3 border-b border-divider px-5 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  {/* Tay kéo sắp xếp (chỉ mang tính trực quan) */}
                  <GripVertical
                    size={14}
                    className={`flex-shrink-0 text-text-muted/50 ${isHost ? "cursor-grab" : "cursor-default"}`}
                  />

                  {/* Số thứ tự */}
                  <span className="w-4 flex-shrink-0 text-xs text-text-muted">{index + 1}</span>

                  {/* Ảnh bìa */}
                  <div
                    className="h-9 w-9 flex-shrink-0 rounded-md bg-surface-strong bg-cover bg-center"
                    style={song.thumbnail ? { backgroundImage: `url(${song.thumbnail})` } : undefined}
                  />

                  {/* Tên bài / ca sĩ / nguồn / người thêm */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="m-0 truncate text-[13px] font-medium text-text-primary">{song.title}</p>
                      {badgeLabel && (
                        <span className="flex-shrink-0 whitespace-nowrap rounded-full border border-border bg-white/5 px-1.5 py-[1px] text-[9px] uppercase tracking-wide text-text-muted">
                          {badgeLabel}
                        </span>
                      )}
                    </div>
                    <p className="m-0 truncate text-[11px] text-text-muted">
                      {song.artist}
                      {song.artist && addedByLabel ? " · " : ""}
                      {addedByLabel ? `Thêm bởi ${addedByLabel}` : ""}
                    </p>
                  </div>

                  {/* Thời lượng */}
                  <span className="flex-shrink-0 text-[11px] text-text-muted">
                    {formatDuration(song.duration)}
                  </span>

                  {/* Hành động */}
                  <div className="flex min-w-[50px] flex-shrink-0 items-center justify-end gap-1.5">
                    {isPending && isHost && (
                      <>
                        <button
                          onClick={() => onApprove?.(song.id)}
                          title="Duyệt"
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-white/5 text-text-secondary hover:bg-white/10"
                        >
                          <Check size={12} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => onReject?.(song.id)}
                          title="Từ chối"
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-divider bg-transparent text-text-muted hover:bg-white/5"
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      </>
                    )}

                    {isPending && !isHost && (
                      <span className="text-[10px] italic text-key/80">Đang chờ</span>
                    )}

                    {!isPending && showRemove && (
                      <button
                        onClick={() => onRemove?.(song.id)}
                        title="Xóa khỏi hàng chờ"
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-divider bg-transparent text-text-muted hover:bg-white/5"
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Xóa hết yêu cầu chờ duyệt (cố định, không scroll) */}
      {isHost && pendingCount > 0 && (
        <button
          onClick={() => onClearPending?.()}
          className="m-3 flex flex-shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-input border border-divider bg-white/[0.03] py-2.5 text-xs text-text-secondary hover:bg-white/5"
        >
          <Trash2 size={13} strokeWidth={2} />
          Xóa hết yêu cầu chờ duyệt
        </button>
      )}
    </div>
  );
}