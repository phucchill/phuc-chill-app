"use client";

import { RefObject, useEffect, useRef, useState } from "react";

interface MusicPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  roomId: string;
  isHost: boolean;
  currentSong: string;       // đường dẫn file mp3
  songTitle?: string;        // tên bài (từ musicAPI)
  songArtist?: string;       // ca sĩ (từ musicAPI)
  songAvatar?: string;       // ảnh bìa (từ musicAPI)
  isPlaying: boolean;
  needsInteraction: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: () => void;
  onInteract: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export default function MusicPlayer({
  audioRef,
  roomId,
  isHost,
  currentSong,
  songTitle,
  songArtist,
  songAvatar,
  isPlaying,
  needsInteraction,
  onPlay,
  onPause,
  onSeek,
  onInteract,
  onNext,
  onPrev,
}: MusicPlayerProps) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Reset lỗi ảnh khi bài đổi
  useEffect(() => {
    setAvatarError(false);
  }, [songAvatar]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (!isDragging) setProgress(audio.currentTime);
    };
    const updateDuration = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", updateDuration);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", updateDuration);
    };
  }, [isDragging]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHost || !audioRef.current || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
    setProgress(ratio * duration);
    onSeek();
  };

  // Tên hiển thị: ưu tiên songTitle, fallback parse từ đường dẫn
  const displayTitle =
    songTitle ||
    (currentSong
      ? currentSong.split("/").pop()?.replace(".mp3", "").replace(/-/g, " ") || "Unknown"
      : "Chưa có bài");

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const showRealAvatar = songAvatar && !avatarError;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0c0c0e] border border-white/10">
      {/* Banner autoplay bị block */}
      {needsInteraction && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-black/90">
          {showRealAvatar && (
            <div
              className="mb-1 h-14 w-14 rounded-xl bg-cover bg-center"
              style={{ backgroundImage: `url(${songAvatar})` }}
            />
          )}
          {!showRealAvatar && <div className="text-4xl">🎵</div>}
          <p className="m-0 text-center text-[15px] text-white/80 font-sans">
            Phòng đang phát nhạc
          </p>
          {songTitle && (
            <p className="-mt-1 text-[13px] text-white/50 font-sans">
              {songTitle}
              {songArtist ? ` — ${songArtist}` : ""}
            </p>
          )}
          <button
            onClick={onInteract}
            className="mt-1 rounded-full bg-[#ff2d55] px-7 py-3 text-[14px] font-medium text-white font-sans cursor-pointer"
          >
            Bấm để nghe cùng
          </button>
        </div>
      )}

      <div className="relative px-9 py-8">
        <div className="flex items-center gap-8">
          {/* Album Art */}
          <div className="relative flex-shrink-0">
            <div
              className={`h-[140px] w-[140px] overflow-hidden rounded-2xl bg-[#1a1a1c] flex items-center justify-center ${
                isPlaying ? "animate-[spin-slow_20s_linear_infinite]" : ""
              }`}
            >
              {showRealAvatar ? (
                <img
                  src={songAvatar}
                  alt={displayTitle}
                  onError={() => setAvatarError(true)}
                  className="block h-full w-full object-cover"
                />
              ) : (
                <div className="relative flex h-full w-full items-center justify-center">
                  <div className="absolute inset-0 [background:repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.04)_0px,rgba(255,255,255,0)_2px,rgba(255,255,255,0)_8px,rgba(255,255,255,0.04)_10px)]" />
                  <div className="z-[1] h-8 w-8 rounded-full border-2 border-white/10 bg-black/60" />
                  <svg
                    className="absolute z-[2]"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="rgba(255,255,255,0.35)"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Info & Controls */}
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-white/40 font-sans">
                {isPlaying ? "▶ Đang phát" : "⏸ Đã dừng"} · Phòng {roomId}
              </div>
              <h2 className="m-0 mb-1 font-serif text-2xl font-bold capitalize leading-[1.1] text-white">
                {displayTitle}
              </h2>
              {songArtist && (
                <p className="m-0 text-[13px] text-white/40 font-sans">{songArtist}</p>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div
                ref={progressBarRef}
                onClick={handleProgressClick}
                className={`relative mb-2 h-1 rounded-full bg-white/10 ${
                  isHost ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <div
                  className="relative h-full rounded-full bg-[#ff2d55] shadow-[0_0_20px_rgba(255,45,85,0.5)]"
                  style={{
                    width: `${progressPercent}%`,
                    transition: isDragging ? "none" : "width 0.2s linear",
                  }}
                >
                  <div className="absolute right-[-5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#ff2d55] shadow-[0_0_20px_rgba(255,45,85,0.5)]" />
                </div>
              </div>
              <div className="flex justify-between font-sans text-[11px] text-white/30">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={onPrev}
                disabled={!isHost}
                className={`flex items-center border-none bg-transparent p-0 transition-opacity ${
                  isHost ? "cursor-pointer opacity-60 hover:opacity-100" : "cursor-not-allowed opacity-20"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19 20L9 12l10-8v16zM5 4h2v16H5z" />
                </svg>
              </button>

              <button
                onClick={isPlaying ? onPause : onPlay}
                disabled={!isHost}
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-none transition-transform hover:scale-[1.08] ${
                  isHost
                    ? "cursor-pointer bg-[#ff2d55] shadow-[0_0_20px_rgba(255,45,85,0.5)]"
                    : "cursor-not-allowed bg-white/10"
                }`}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="ml-0.5">
                    <path d="M5 3l14 9-14 9V3z" />
                  </svg>
                )}
              </button>

              <button
                onClick={onNext}
                disabled={!isHost}
                className={`flex items-center border-none bg-transparent p-0 transition-opacity ${
                  isHost ? "cursor-pointer opacity-60 hover:opacity-100" : "cursor-not-allowed opacity-20"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M5 4l10 8-10 8V4zm14 0h2v16h-2z" />
                </svg>
              </button>

              <div className="ml-auto flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
                  <path
                    d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="h-[3px] w-[70px] cursor-pointer accent-white/70"
                />
              </div>
            </div>

            {!isHost && (
              <p className="m-0 text-[11px] italic text-white/20 font-sans">
                Chỉ host mới có thể điều khiển nhạc
              </p>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} />

      <style>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}