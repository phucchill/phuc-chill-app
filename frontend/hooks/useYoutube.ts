"use client";

import { useCallback, useState } from "react";
import { fetchYoutubePreview, isValidYoutubeUrl } from "../lib/youtube";
import { YoutubePreview } from "../types/upload";

interface UseYoutubeOptions {
  apiBase: string;
}

export function useYoutube({ apiBase }: UseYoutubeOptions) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<YoutubePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    setError(null);
    setPreview(null);

    if (!url.trim()) {
      setError("Vui lòng dán một link YouTube");
      return;
    }

    if (!isValidYoutubeUrl(url)) {
      setError("Link YouTube không hợp lệ. Ví dụ: https://youtu.be/xxxxxxxxxxx");
      return;
    }

    setLoading(true);
    try {
      const result = await fetchYoutubePreview(url, apiBase);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lấy thông tin video");
    } finally {
      setLoading(false);
    }
  }, [apiBase, url]);

  const reset = useCallback(() => {
    setUrl("");
    setPreview(null);
    setError(null);
    setLoading(false);
  }, []);

  return { url, setUrl, preview, loading, error, fetchPreview, reset };
}