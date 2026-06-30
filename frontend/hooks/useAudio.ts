import { RefObject, useRef, useState } from "react";

export function useAudio(audioRef: RefObject<HTMLAudioElement | null>) {
  const [needsInteraction, setNeedsInteraction] = useState(false);

  const lastSyncRef = useRef({
    src: "",
    progress: 0,
    syncedAt: 0,
  });

  const isSameSrc = (current: string, next: string) => {
    try {
      const a = new URL(current).pathname;
      return a === next || a.endsWith(next);
    } catch {
      return current === next || current.endsWith(next);
    }
  };

  const syncPlay = async (src: string, progress: number) => {
  const audio = audioRef.current;
  if (!audio) return;

  lastSyncRef.current = {
    src,
    progress,
    syncedAt: Date.now(),
  };

  try {
    if (!isSameSrc(audio.src, src)) {
      audio.src = src;
      audio.load();

      await new Promise<void>((resolve) => {
        const handleLoaded = () => {
          audio.removeEventListener(
            "loadedmetadata",
            handleLoaded
          );
          resolve();
        };

        audio.addEventListener(
          "loadedmetadata",
          handleLoaded
        );
      });
    }

    audio.currentTime = progress || 0;

    await audio.play();

    setNeedsInteraction(false);
  } catch (err) {
    console.warn("[Audio] Autoplay bị chặn:", err);
    setNeedsInteraction(true);
  }
};

  const syncPause = (progress: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = progress;
    audio.pause();
    setNeedsInteraction(false);
  };

  const syncSeek = (progress: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = progress;
  };

  const handleInteract = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const last = lastSyncRef.current;

    if (last.src) {
      if (!isSameSrc(audio.src, last.src)) {
        audio.src = last.src;
        audio.load();
      }

      const elapsed = last.syncedAt ? (Date.now() - last.syncedAt) / 1000 : 0;
      audio.currentTime = last.progress + elapsed;
    }

    try {
      await audio.play();
      setNeedsInteraction(false);
    } catch (err) {
      console.warn("[Audio] User interact play lỗi:", err);
      setNeedsInteraction(true);
    }
  };

  return {
    needsInteraction,
    syncPlay,
    syncPause,
    syncSeek,
    handleInteract,
  };
}