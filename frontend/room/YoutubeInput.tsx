"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useYoutube } from "../hooks/useYoutube";
import SongMetadataForm from "./SongMetadataForm";
import Button from "../components/ui/Button";
import { extractYoutubeVideoId, formatYoutubeDuration, getYoutubeThumbnailUrl } from "../lib/youtube";
import { QueueSongInput } from "../types/upload";

interface YoutubeInputProps {
  apiBase: string;
  currentUserName?: string;
  onAdd: (song: QueueSongInput) => void;
  disabled?: boolean;
}

let ytIdCounter = 0;
function nextId() {
  ytIdCounter += 1;
  return `youtube-${Date.now()}-${ytIdCounter}`;
}

export default function YoutubeInput({ apiBase, currentUserName, onAdd, disabled }: YoutubeInputProps) {
  const { url, setUrl, preview, loading, error, fetchPreview, reset } = useYoutube({ apiBase });
  const [reviewing, setReviewing] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const handleFetchPreview = async () => {
    const id = extractYoutubeVideoId(url);
    setVideoId(id);
    await fetchPreview();
    // Kể cả khi backend chưa trả xong hoặc lỗi, videoId hợp lệ là đủ để
    // vào bước review với avatar auto-fill từ pattern YouTube — người
    // dùng vẫn có thể tự gõ Title/Artist nếu oEmbed không lấy được.
    if (id) setReviewing(true);
  };

  const handleConfirm = (values: { title: string; artist: string; thumbnail: string }) => {
    if (!videoId) return;

    onAdd({
      id: nextId(),
      title: values.title,
      artist: values.artist || undefined,
      thumbnail: values.thumbnail || undefined,
      duration: preview?.duration,
      songSrc: preview?.url ?? `https://www.youtube.com/watch?v=${videoId}`,
      source: "youtube",
      addedBy: currentUserName,
    });

    setReviewing(false);
    setVideoId(null);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
    reset();
    setUrl("");
  };

  const handleCancelReview = () => {
    setReviewing(false);
    setVideoId(null);
    reset();
  };

  if (disabled) {
    return (
      <div className="flex h-full items-center justify-center rounded-card border border-divider bg-white/[0.02] p-8 text-center">
        <p className="m-0 text-[13px] text-text-muted">
          Host đã tắt tính năng thêm bài từ YouTube cho thành viên.
        </p>
      </div>
    );
  }

  if (reviewing && videoId) {
    return (
      <SongMetadataForm
        key={videoId}
        sourceLabel="YouTube"
        durationLabel={preview?.duration ? formatYoutubeDuration(preview.duration) : undefined}
        initialTitle={preview?.title ?? ""}
        initialArtist={preview?.channel ?? ""}
        initialThumbnail={preview?.thumbnail ?? getYoutubeThumbnailUrl(videoId)}
        onConfirm={handleConfirm}
        onCancel={handleCancelReview}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetchPreview()}
          placeholder="Dán link YouTube: https://youtu.be/..."
          className="min-w-0 flex-1 rounded-input border border-border bg-white/5 px-3.5 py-2.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-key"
        />
        <Button variant="primary" onClick={handleFetchPreview} disabled={loading}>
          {loading ? "Đang tải..." : "Tiếp tục"}
        </Button>
      </div>

      {error && !extractYoutubeVideoId(url) && <p className="m-0 text-[12px] text-key">{error}</p>}

      {justAdded && (
        <p className="m-0 flex items-center gap-1.5 text-[12px] text-text-secondary">
          <Check size={13} strokeWidth={2.5} className="text-key" />
          Đã thêm vào hàng chờ
        </p>
      )}

      {!error && (
        <p className="m-0 text-[11px] text-text-muted">
          Hỗ trợ link dạng youtu.be/... hoặc youtube.com/watch?v=... — sau khi dán link, bạn có thể
          chỉnh lại tên bài, nghệ sĩ và ảnh đại diện trước khi thêm.
        </p>
      )}
    </div>
  );
}