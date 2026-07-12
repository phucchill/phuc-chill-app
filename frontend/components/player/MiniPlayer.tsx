"use client";

import { RefObject, useEffect, useState } from "react";
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { isValidYoutubeUrl } from "../../lib/youtube";
import type { YoutubePlayerHandle } from "../../types/youtubePlayer";
import Slider from "../ui/Slider";

type RepeatMode = "off" | "one" | "all";

interface MiniPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  youtubePlayerRef: RefObject<YoutubePlayerHandle | null>;
  isHost: boolean;
  currentSong: string;
  songTitle?: string;
  songArtist?: string;
  songAvatar?: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  shuffleEnabled?: boolean;
  repeatMode?: RepeatMode;
  isLiked?: boolean;
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
  onToggleLike?: () => void;
}

/**
 * Thanh mini player cố định cuối màn hình, kiểu Apple Music Desktop.
 *
 * QUAN TRỌNG: component này KHÔNG tạo thêm player/audio nào — nó chỉ đọc
 * (poll) tiến trình từ CHÍNH audioRef/youtubePlayerRef mà MusicPlayer.tsx
 * đang dùng (2 component cùng nhận chung 1 ref từ page.tsx). Mọi lệnh
 * play/pause/next/prev/seek đều gọi ngược ra ngoài qua props — component
 * này không tự quyết định logic phát nhạc, chỉ trình bày + chuyển tiếp
 * tương tác, giống hệt nguyên tắc của MusicPlayer.tsx.
 */
export default function MiniPlayer({
  audioRef,
  youtubePlayerRef,
  isHost,
  currentSong,
  songTitle,
  songArtist,
  songAvatar,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onNext,
  onPrev,
  shuffleEnabled = false,
  repeatMode = "off",
  isLiked = false,
  onToggleShuffle,
  onCycleRepeat,
  onToggleLike,
}: MiniPlayerProps) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [avatarError, setAvatarError] = useState(false);

  const isYoutube = isValidYoutubeUrl(currentSong);

  useEffect(() => {
    setAvatarError(false);
  }, [songAvatar]);

  // Poll tiến trình mỗi 500ms — không cần chính xác tuyệt đối vì đây chỉ
  // là thanh mini, người dùng muốn xem/điều khiển chi tiết thì đã có
  // MusicPlayer to ở giữa.
  useEffect(() => {
    const interval = setInterval(() => {
      if (isYoutube) {
        try {
          setProgress(youtubePlayerRef.current?.youtube.getCurrentTime() ?? 0);
          const d = youtubePlayerRef.current?.youtube.getDuration() ?? 0;
          if (d) setDuration(d);
        } catch {
          /* ignore */
        }
      } else {
        const audio = audioRef.current;
        if (audio) {
          setProgress(audio.currentTime || 0);
          setDuration(audio.duration || 0);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isYoutube, audioRef, youtubePlayerRef]);

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSeekCommit = (val: number) => {
    if (!isHost || !duration) return;
    if (isYoutube) {
      try {
        youtubePlayerRef.current?.youtube.seekTo(val);
      } catch {
        /* ignore */
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
    setProgress(val);
    onSeek();
  };

  const showRealAvatar = songAvatar && !avatarError;
  const hasSong = !!currentSong;

  return (
    <div className="glass-card fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-surface/90">
      {/* Thanh tiến trình mảnh, chạy dọc mép trên — kiểu Apple Music Desktop */}
      <div className="px-0">
        <Slider
          value={progress}
          max={duration || 1}
          onChange={setProgress}
          onChangeCommit={handleSeekCommit}
          disabled={!isHost || !duration}
          variant="volume"
          ariaLabel="Tiến trình bài hát"
        />
      </div>

      <div className="mx-auto flex h-[68px] max-w-[1720px] items-center gap-4 px-6">
        {/* Album nhỏ + tên bài */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-md bg-surface-strong">
            {showRealAvatar ? (
              <img
                src={songAvatar}
                alt=""
                onError={() => setAvatarError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-text-muted">♪</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="m-0 truncate text-[13px] font-medium text-text-primary">
              {hasSong ? songTitle || "Đang phát" : "Chưa có bài"}
            </p>
            <p className="m-0 truncate text-[11px] text-text-muted">{songArtist}</p>
          </div>

          <button
            onClick={() => onToggleLike?.()}
            disabled={!hasSong}
            className={`ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
              hasSong ? "cursor-pointer" : "cursor-not-allowed opacity-30"
            }`}
          >
            <Heart
              size={14}
              className={isLiked ? "text-key" : "text-text-muted hover:text-text-secondary"}
              fill={isLiked ? "currentColor" : "none"}
              strokeWidth={2}
            />
          </button>
        </div>

        {/* Control giữa */}
        <div className="flex flex-shrink-0 items-center gap-4">
          <button
            onClick={() => isHost && onToggleShuffle?.()}
            disabled={!isHost}
            className={isHost ? "cursor-pointer opacity-70 hover:opacity-100" : "cursor-not-allowed opacity-30"}
          >
            <Shuffle size={15} className={shuffleEnabled ? "text-key" : "text-text-secondary"} strokeWidth={2} />
          </button>

          <button
            onClick={onPrev}
            disabled={!isHost}
            className={isHost ? "cursor-pointer text-text-primary opacity-70 hover:opacity-100" : "cursor-not-allowed text-text-muted opacity-30"}
          >
            <SkipBack size={17} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            onClick={isPlaying ? onPause : onPlay}
            disabled={!isHost}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              isHost ? "cursor-pointer bg-key hover:brightness-110" : "cursor-not-allowed bg-white/10"
            }`}
          >
            {isPlaying ? (
              <Pause size={15} fill="white" strokeWidth={0} />
            ) : (
              <Play size={15} fill="white" strokeWidth={0} className="ml-0.5" />
            )}
          </button>

          <button
            onClick={onNext}
            disabled={!isHost}
            className={isHost ? "cursor-pointer text-text-primary opacity-70 hover:opacity-100" : "cursor-not-allowed text-text-muted opacity-30"}
          >
            <SkipForward size={17} fill="currentColor" strokeWidth={0} />
          </button>

          <button
            onClick={() => isHost && onCycleRepeat?.()}
            disabled={!isHost}
            className={isHost ? "cursor-pointer opacity-70 hover:opacity-100" : "cursor-not-allowed opacity-30"}
          >
            {repeatMode === "one" ? (
              <Repeat1 size={15} className="text-key" strokeWidth={2} />
            ) : (
              <Repeat size={15} className={repeatMode === "all" ? "text-key" : "text-text-secondary"} strokeWidth={2} />
            )}
          </button>
        </div>

        {/* Thời gian + khoảng trống cân layout (Volume chính đã có ở MusicPlayer to) */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="text-[11px] text-text-muted">
            {formatTime(progress)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}