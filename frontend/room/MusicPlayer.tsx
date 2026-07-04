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
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 24,
        overflow: "hidden",
        backdropFilter: "blur(20px)",
        position: "relative",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          top: -80,
          left: "50%",
          transform: "translateX(-50%)",
          width: 400,
          height: 200,
          background: isPlaying
            ? "radial-gradient(ellipse, rgba(124,58,237,0.15) 0%, transparent 70%)"
            : "radial-gradient(ellipse, rgba(124,58,237,0.05) 0%, transparent 70%)",
          transition: "all 1s ease",
          pointerEvents: "none",
        }}
      />

      {/* Banner autoplay bị block */}
      {needsInteraction && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: "rgba(8,4,18,0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            borderRadius: 24,
          }}
        >
          {showRealAvatar && (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                backgroundImage: `url(${songAvatar})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                marginBottom: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            />
          )}
          {!showRealAvatar && <div style={{ fontSize: 36 }}>🎵</div>}
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: "rgba(255,255,255,0.8)",
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center",
            }}
          >
            Phòng đang phát nhạc
          </p>
          {songTitle && (
            <p style={{
              margin: "-4px 0 0",
              fontSize: 13,
              color: "rgba(167,139,250,0.7)",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {songTitle}{songArtist ? ` — ${songArtist}` : ""}
            </p>
          )}
          <button
            onClick={onInteract}
            style={{
              marginTop: 4,
              padding: "12px 28px",
              borderRadius: 50,
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #ec4899)",
              color: "white",
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
            }}
          >
            Bấm để nghe cùng
          </button>
        </div>
      )}

      <div style={{ padding: "32px 36px", position: "relative" }}>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {/* Album Art */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 20,
                background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isPlaying
                  ? "0 20px 60px rgba(124,58,237,0.4), 0 0 0 1px rgba(167,139,250,0.1)"
                  : "0 10px 40px rgba(0,0,0,0.5)",
                transition: "box-shadow 0.5s ease",
                animation: isPlaying ? "spin-slow 20s linear infinite" : "none",
                overflow: "hidden",
              }}
            >
              {showRealAvatar ? (
                /* Ảnh bìa thật từ musicAPI */
                <img
                  src={songAvatar}
                  alt={displayTitle}
                  onError={() => setAvatarError(true)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                /* Fallback vinyl khi chưa có ảnh */
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `
                        repeating-radial-gradient(circle at center,
                          rgba(255,255,255,0.04) 0px,
                          rgba(255,255,255,0) 2px,
                          rgba(255,255,255,0) 8px,
                          rgba(255,255,255,0.04) 10px
                        )
                      `,
                    }}
                  />
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.6)",
                      zIndex: 1,
                      border: "2px solid rgba(255,255,255,0.1)",
                    }}
                  />
                  <svg
                    style={{ position: "absolute", zIndex: 2 }}
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="rgba(167,139,250,0.8)"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
            </div>

            {isPlaying && (
              <div
                style={{
                  position: "absolute",
                  inset: -4,
                  borderRadius: 24,
                  border: "2px solid transparent",
                  borderTopColor: "rgba(167,139,250,0.6)",
                  borderRightColor: "rgba(236,72,153,0.4)",
                  animation: "border-spin 2s linear infinite",
                }}
              />
            )}
          </div>

          {/* Info & Controls */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(167,139,250,0.7)",
                  fontFamily: "'DM Sans', sans-serif",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                {isPlaying ? "▶ Đang phát" : "⏸ Đã dừng"} · Phòng {roomId}
              </div>
              <h2
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "white",
                  margin: "0 0 4px",
                  lineHeight: 1.1,
                  textTransform: "capitalize",
                }}
              >
                {displayTitle}
              </h2>
              {/* Ca sĩ — chỉ hiện khi có */}
              {songArtist && (
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.4)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {songArtist}
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div
                ref={progressBarRef}
                onClick={handleProgressClick}
                style={{
                  height: 4,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 2,
                  cursor: isHost ? "pointer" : "default",
                  position: "relative",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    background: "linear-gradient(90deg, #7c3aed, #ec4899)",
                    borderRadius: 2,
                    transition: isDragging ? "none" : "width 0.2s linear",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      right: -5,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "white",
                      boxShadow: "0 0 8px rgba(167,139,250,0.8)",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onClick={onPrev}
                disabled={!isHost}
                style={{
                  background: "none",
                  border: "none",
                  cursor: isHost ? "pointer" : "not-allowed",
                  opacity: isHost ? 0.6 : 0.2,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  transition: "opacity 0.2s",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M19 20L9 12l10-8v16zM5 4h2v16H5z" />
                </svg>
              </button>

              <button
                onClick={isPlaying ? onPause : onPlay}
                disabled={!isHost}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: isHost
                    ? "linear-gradient(135deg, #7c3aed, #ec4899)"
                    : "rgba(255,255,255,0.1)",
                  border: "none",
                  cursor: isHost ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isHost ? "0 8px 24px rgba(124,58,237,0.4)" : "none",
                  transition: "all 0.2s ease",
                  transform: "scale(1)",
                }}
                onMouseEnter={(e) => {
                  if (isHost) e.currentTarget.style.transform = "scale(1.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
                    <path d="M5 3l14 9-14 9V3z" />
                  </svg>
                )}
              </button>

              <button
                onClick={onNext}
                disabled={!isHost}
                style={{
                  background: "none",
                  border: "none",
                  cursor: isHost ? "pointer" : "not-allowed",
                  opacity: isHost ? 0.6 : 0.2,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  transition: "opacity 0.2s",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M5 4l10 8-10 8V4zm14 0h2v16h-2z" />
                </svg>
              </button>

              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
                  <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"
                    stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  style={{ width: 70, accentColor: "#7c3aed", cursor: "pointer", height: 3 }}
                />
              </div>
            </div>

            {!isHost && (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.2)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontStyle: "italic",
                }}
              >
                Chỉ host mới có thể điều khiển nhạc
              </p>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} />

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes border-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}