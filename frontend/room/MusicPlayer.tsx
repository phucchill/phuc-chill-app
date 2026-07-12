"use client";

import {
  RefObject,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { isValidYoutubeUrl } from "../lib/youtube";
import type { YoutubePlayerHandle, YTPlayerInstance } from "../types/youtubePlayer";
import Slider from "../components/ui/Slider";

type RepeatMode = "off" | "one" | "all";

interface MusicPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>;
  roomId: string;
  isHost: boolean;
  currentSong: string;       // đường dẫn file mp3 HOẶC link YouTube
  songTitle?: string;        // tên bài (từ musicAPI)
  songArtist?: string;       // ca sĩ (từ musicAPI)
  songAvatar?: string;       // ảnh bìa (từ musicAPI)
  isPlaying: boolean;
  needsInteraction: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds?: number) => void;
  onInteract: () => void;
  onNext?: () => void;
  onPrev?: () => void;

  shuffleEnabled?: boolean;
  repeatMode?: RepeatMode;
  isLiked?: boolean;
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
  onToggleLike?: () => void;
}

function lockYoutubeIframe(iframe: HTMLIFrameElement | null | undefined) {
  if (!iframe) return;
  iframe.setAttribute("tabindex", "-1");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "320px";
  iframe.style.height = "180px";
  iframe.style.pointerEvents = "none";
  iframe.style.opacity = "0";
}

// CSS !important LUÔN thắng inline style KHÔNG có !important — kể cả khi
// script nội bộ của YouTube tự ghi đè iframe.style (đúng lúc loadVideoById
// chạy, gây hiệu ứng "phóng to" 1 nhịp trước khi onStateChange kịp bắn).
// Đây là lớp khóa CHẮC CHẮN, lockYoutubeIframe() ở trên chỉ là lớp dự
// phòng bổ sung, không phải lớp khóa chính nữa.
function injectYoutubeLockStyle(containerId: string) {
  if (typeof document === "undefined") return;
  const styleId = `yt-lock-${containerId}`;
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #${containerId} {
      position: fixed !important;
      top: -9999px !important;
      left: -9999px !important;
      width: 320px !important;
      height: 180px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      z-index: -1 !important;
    }
  `;
  document.head.appendChild(style);
}

const MusicPlayer = forwardRef<YoutubePlayerHandle, MusicPlayerProps>(function MusicPlayer(
  {
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
    shuffleEnabled = false,
    repeatMode = "off",
    isLiked = false,
    onToggleShuffle,
    onCycleRepeat,
    onToggleLike,
  },
  ref
) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [ytReady, setYtReady] = useState(false);

  const isYoutube = isValidYoutubeUrl(currentSong);

  // useId() thay vì Math.random(): giá trị này PHẢI giống hệt nhau giữa
  // lần render trên server (SSR) và lần hydrate đầu tiên trên client, nếu
  // không React sẽ báo lỗi "hydration mismatch" (đúng lỗi console bạn gặp)
  // vì id trên HTML server-rendered khác id client tự sinh lại. useId()
  // được React đảm bảo ổn định qua SSR/hydrate. Bỏ dấu ":" vì useId() trả
  // về dạng ":r0:" — ký tự ":" không hợp lệ khi dùng làm CSS selector thô
  // (injectYoutubeLockStyle() bên dưới cần "#id { ... }").
  const reactId = useId().replace(/:/g, "");
  const youtubeContainerIdRef = useRef(`yt-player-${reactId}`);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const volumeRef = useRef(volume);
  const pendingSyncRef = useRef<{ videoId: string; startSeconds: number } | null>(null);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const createPlayer = () => {
      if (!window.YT || ytPlayerRef.current) return;
      injectYoutubeLockStyle(youtubeContainerIdRef.current);
      ytPlayerRef.current = new window.YT.Player(youtubeContainerIdRef.current, {
        width: "320",
        height: "180",
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e: any) => {
            ytReadyRef.current = true;
            setYtReady(true);
            try {
              lockYoutubeIframe(e?.target?.getIframe?.());
              ytPlayerRef.current?.setVolume(Math.round(volumeRef.current * 100));
              // Nếu playVideo() bị gọi trước khi player sẵn sàng (do
              // ReadyState race), áp dụng lại lệnh play/video đang chờ.
              if (pendingSyncRef.current) {
                const { videoId, startSeconds } = pendingSyncRef.current;
                pendingSyncRef.current = null;
                currentVideoIdRef.current = videoId;
                const restoreVolume = Math.round(volumeRef.current * 100);
                try {
                  ytPlayerRef.current?.mute();
                } catch {
                  /* ignore */
                }
                ytPlayerRef.current?.loadVideoById(videoId, startSeconds);
                ytPlayerRef.current?.playVideo();
                setTimeout(() => {
                  try {
                    ytPlayerRef.current?.unMute();
                    ytPlayerRef.current?.setVolume(restoreVolume);
                  } catch {
                    /* ignore */
                  }
                }, 350);
              }
            } catch {
              /* ignore */
            }
          },
          onStateChange: (e: any) => {
            try {
              lockYoutubeIframe(e?.target?.getIframe?.());
            } catch {
              /* ignore */
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
      return;
    }

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      createPlayer();
    };

    return () => {
      ytPlayerRef.current?.destroy?.();
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
      setYtReady(false);
      currentVideoIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      youtube: {
        isReady: () => ytReadyRef.current && !!ytPlayerRef.current,
        playVideo: (videoId, startSeconds = 0) => {
          const player = ytPlayerRef.current;
          if (!player || !ytReadyRef.current) {
            // Player chưa sẵn sàng — lưu lại lệnh, onReady sẽ áp dụng khi
            // player khởi tạo xong. Trước đây lệnh này bị NUỐT MẤT nếu
            // đến sớm hơn onReady, khiến user vào phòng trễ hoặc bị đổi
            // bài trong lúc player đang khởi tạo sẽ KHÔNG đồng bộ.
            pendingSyncRef.current = { videoId, startSeconds };
            return;
          }
          try {
            // MUTE-TRICK: iframe YouTube là 1 origin/browsing-context khác
            // (youtube.com). Cú click "Bấm để nghe cùng" của user chỉ cấp
            // quyền autoplay cho ĐÚNG lần gọi playVideo() đó — mọi lần gọi
            // SAU (khi host bấm Next/Prev, ROOM_STATE tự đẩy xuống) KHÔNG
            // gắn với thao tác chuột/tay nào của user trên trang → trình
            // duyệt ÂM THẦM CHẶN autoplay có tiếng bên trong iframe, không
            // báo lỗi gì, đây chính là lý do "user không đồng bộ". Autoplay
            // Ở CHẾ ĐỘ TẮT TIẾNG luôn được trình duyệt cho phép vô điều
            // kiện, nên: mute → play → unmute lại sau khi đã bắt đầu phát.
            const restoreVolume = Math.round(volumeRef.current * 100);
            try {
              player.mute();
            } catch {
              /* ignore */
            }

            if (currentVideoIdRef.current === videoId) {
              const current = player.getCurrentTime();
              if (Math.abs(current - startSeconds) > 2) {
                player.seekTo(startSeconds, true);
              }
              player.playVideo();
            } else {
              currentVideoIdRef.current = videoId;
              player.loadVideoById(videoId, startSeconds);
              player.playVideo();
            }

            setTimeout(() => {
              try {
                ytPlayerRef.current?.unMute();
                ytPlayerRef.current?.setVolume(restoreVolume);
              } catch {
                /* ignore */
              }
            }, 350);
          } catch {
            pendingSyncRef.current = { videoId, startSeconds };
          }
        },
        pauseVideo: () => {
          try {
            ytPlayerRef.current?.pauseVideo();
          } catch {
            /* ignore */
          }
        },
        seekTo: (seconds) => {
          try {
            ytPlayerRef.current?.seekTo(seconds, true);
          } catch {
            /* ignore */
          }
        },
        getCurrentTime: () => {
          try {
            return ytPlayerRef.current?.getCurrentTime() ?? 0;
          } catch {
            return 0;
          }
        },
        getDuration: () => {
          try {
            return ytPlayerRef.current?.getDuration() ?? 0;
          } catch {
            return 0;
          }
        },
        setVolume: (volumePercent) => {
          try {
            ytPlayerRef.current?.setVolume(volumePercent);
          } catch {
            /* ignore */
          }
        },
      },
    }),
    []
  );

  useEffect(() => {
    if (!isYoutube) return;

    const interval = setInterval(() => {
      if (!ytReadyRef.current || isDragging) return;
      try {
        setProgress(ytPlayerRef.current?.getCurrentTime() ?? 0);
        const d = ytPlayerRef.current?.getDuration() ?? 0;
        if (d) setDuration(d);
      } catch {
        /* ignore */
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isYoutube, isDragging]);

  useEffect(() => {
    setAvatarError(false);
  }, [songAvatar]);

  useEffect(() => {
    if (isYoutube) return;
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
  }, [isDragging, isYoutube]);

  // Áp dụng volume cho ĐÚNG player đang active. Chạy lại khi ytReady đổi
  // (trước đây chỉ phụ thuộc [volume, isYoutube] nên nếu người dùng kéo
  // volume TRƯỚC KHI player YouTube sẵn sàng, giá trị đó không bao giờ
  // được áp dụng lại sau khi player ready — nút âm lượng "không có tác
  // dụng" y như báo cáo).
  useEffect(() => {
    if (isYoutube) {
      if (!ytReady) return;
      try {
        ytPlayerRef.current?.setVolume(Math.round(volume * 100));
      } catch {
        /* ignore */
      }
    } else if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, isYoutube, ytReady]);

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleProgressChange = (val: number) => {
    if (!isHost) return;
    setIsDragging(true);
    setProgress(val);
  };

  const handleProgressCommit = (val: number) => {
    if (!isHost || !duration) return;
    setIsDragging(false);

    if (isYoutube) {
      try {
        ytPlayerRef.current?.seekTo(val, true);
      } catch {
        /* ignore */
      }
    } else if (audioRef.current) {
      audioRef.current.currentTime = val;
    }

    setProgress(val);
    // Truyền THẲNG val (vị trí user vừa kéo tới) thay vì để onSeek() tự
    // đọc lại getCurrentTime() từ player. seekTo() của YouTube là BẤT
    // ĐỒNG BỘ (còn phải buffer) — đọc getCurrentTime() ngay sau đó vẫn
    // thường trả về vị trí CŨ (trước khi seek), khiến SYNC_SEEK gửi đi
    // sai vị trí và user khác không tua theo đúng chỗ host vừa kéo tới.
    onSeek(val);
  };

  const displayTitle =
    songTitle ||
    (currentSong && !isYoutube
      ? currentSong.split("/").pop()?.replace(".mp3", "").replace(/-/g, " ") || "Unknown"
      : currentSong
      ? "Đang tải..."
      : "Chưa có bài");

  const showRealAvatar = songAvatar && !avatarError;

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const repeatDisabledClass = !isHost ? "cursor-not-allowed opacity-30" : "cursor-pointer opacity-70 hover:opacity-100";

  return (
    <div className="glass-card relative overflow-hidden rounded-card bg-surface/60 px-9 py-8">
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: -9999,
          left: -9999,
          width: 320,
          height: 180,
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
          zIndex: -1,
        }}
      >
        <div id={youtubeContainerIdRef.current} style={{ width: 320, height: 180 }} />
      </div>

      {needsInteraction && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-card bg-black/90 backdrop-blur-md">
          {showRealAvatar && (
            <div
              className="mb-1 h-14 w-14 rounded-input bg-cover bg-center"
              style={{ backgroundImage: `url(${songAvatar})` }}
            />
          )}
          {!showRealAvatar && <div className="text-4xl">🎵</div>}
          <p className="m-0 text-center text-[15px] text-text-primary/90">Phòng đang phát nhạc</p>
          {songTitle && (
            <p className="-mt-1 text-[13px] text-text-secondary">
              {songTitle}
              {songArtist ? ` — ${songArtist}` : ""}
            </p>
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={onInteract}
            className="mt-1 flex items-center gap-2 rounded-full bg-key px-7 py-3 text-[14px] font-medium text-white hover:brightness-110"
          >
            <Play size={16} fill="white" strokeWidth={0} />
            Bấm để nghe cùng
          </motion.button>
        </div>
      )}

      <div className="flex items-center gap-8">
        <div className="relative flex-shrink-0">
          <div
            className={`relative h-[180px] w-[180px] overflow-hidden rounded-card bg-surface-strong shadow-[0_20px_40px_rgba(0,0,0,0.35)] ${
              isPlaying ? "animate-[spin-slow_24s_linear_infinite]" : ""
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center">
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
                  <div className="z-[1] h-9 w-9 rounded-full border-2 border-white/10 bg-black/60" />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-text-muted">
              {isPlaying ? "Đang phát" : "Đã dừng"} · Phòng {roomId}
              {isYoutube && " · YouTube"}
            </div>
            <h2 className="m-0 mb-1 truncate text-[26px] font-semibold leading-tight text-text-primary">
              {displayTitle}
            </h2>
            <div className="flex items-center gap-3">
              {songArtist && <p className="m-0 truncate text-[14px] text-text-secondary">{songArtist}</p>}

              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onToggleLike?.()}
                disabled={!currentSong}
                aria-label={isLiked ? "Bỏ thích" : "Thích bài này"}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                  currentSong ? "cursor-pointer" : "cursor-not-allowed opacity-30"
                }`}
              >
                <Heart
                  size={16}
                  className={isLiked ? "text-key" : "text-text-muted hover:text-text-secondary"}
                  fill={isLiked ? "currentColor" : "none"}
                  strokeWidth={2}
                />
              </motion.button>
            </div>
          </div>

          <div>
            <Slider
              value={progress}
              max={duration || 1}
              onChange={handleProgressChange}
              onChangeCommit={handleProgressCommit}
              disabled={!isHost || !duration}
              variant="progress"
              ariaLabel="Tiến trình bài hát"
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-text-muted">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <button
              onClick={() => isHost && onToggleShuffle?.()}
              disabled={!isHost}
              aria-label="Phát ngẫu nhiên"
              className={`flex items-center transition-opacity ${repeatDisabledClass}`}
            >
              <Shuffle size={17} className={shuffleEnabled ? "text-key" : "text-text-secondary"} strokeWidth={2} />
            </button>

            <button
              onClick={onPrev}
              disabled={!isHost}
              className={`flex items-center transition-opacity ${
                isHost ? "cursor-pointer text-text-primary opacity-70 hover:opacity-100" : "cursor-not-allowed text-text-muted opacity-30"
              }`}
            >
              <SkipBack size={22} fill="currentColor" strokeWidth={0} />
            </button>

            <motion.button
              onClick={isPlaying ? onPause : onPlay}
              disabled={!isHost}
              whileHover={isHost ? { scale: 1.06 } : undefined}
              whileTap={isHost ? { scale: 0.94 } : undefined}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                isHost ? "cursor-pointer bg-key hover:brightness-110" : "cursor-not-allowed bg-white/10"
              }`}
            >
              {isPlaying ? (
                <Pause size={22} fill="white" strokeWidth={0} />
              ) : (
                <Play size={22} fill="white" strokeWidth={0} className="ml-0.5" />
              )}
            </motion.button>

            <button
              onClick={onNext}
              disabled={!isHost}
              className={`flex items-center transition-opacity ${
                isHost ? "cursor-pointer text-text-primary opacity-70 hover:opacity-100" : "cursor-not-allowed text-text-muted opacity-30"
              }`}
            >
              <SkipForward size={22} fill="currentColor" strokeWidth={0} />
            </button>

            <button
              onClick={() => isHost && onCycleRepeat?.()}
              disabled={!isHost}
              aria-label="Chế độ lặp lại"
              className={`flex items-center transition-opacity ${repeatDisabledClass}`}
            >
              {repeatMode === "one" ? (
                <Repeat1 size={17} className="text-key" strokeWidth={2} />
              ) : (
                <Repeat size={17} className={repeatMode === "all" ? "text-key" : "text-text-secondary"} strokeWidth={2} />
              )}
            </button>

            <div className="ml-auto flex w-[140px] items-center gap-2">
              <VolumeIcon size={16} className="flex-shrink-0 text-text-muted" strokeWidth={2} />
              <Slider
                value={volume}
                max={1}
                onChange={setVolume}
                variant="volume"
                ariaLabel="Âm lượng"
              />
            </div>
          </div>

          {!isHost && (
            <p className="m-0 text-[11px] italic text-text-muted">Chỉ host mới có thể điều khiển nhạc</p>
          )}
        </div>
      </div>

      <audio ref={audioRef} />

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});

export default MusicPlayer;