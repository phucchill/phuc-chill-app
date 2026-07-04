"use client";

import { useState } from "react";
import musicAPI, { Song } from "../lib/musicAPI";

interface SongPickerProps {
  onRequest: (song: {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    songSrc: string;
  }) => void;
  isHost: boolean;
}

const GENRES = ["Tất cả", "V-Pop", "Ballad", "Indie", "Dân Ca", "Bolero"];

export default function SongPicker({ onRequest, isHost }: SongPickerProps) {
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Tất cả");
  const [requested, setRequested] = useState<Set<number>>(new Set());

  const filtered = musicAPI.filter((s) => {
    const matchGenre = genre === "Tất cả" || s.genre === genre;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.songName.toLowerCase().includes(q) ||
      s.songArtist.toLowerCase().includes(q);
    return matchGenre && matchSearch;
  });

  const handleRequest = (song: Song) => {
    onRequest({
      id: crypto?.randomUUID(),
      title: song.songName,
      artist: song.songArtist,
      thumbnail: song.songAvatar,
      duration: song.durationSeconds,
      songSrc: song.songSrc,
    });
    setRequested((prev) => new Set(prev).add(song.id));
    // reset trạng thái "Đã yêu cầu" sau 3s để cho phép request lại
    setTimeout(() => {
      setRequested((prev) => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
    }, 3000);
  };

  return (
    <div
      style={{
      background: "#151425",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20,
        overflow: "hidden",
        backdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        height: 420,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
         background: "#1a192b",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            Chọn bài hát
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              color: "rgba(168, 0, 0, 0.2)",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {isHost ? "Thêm thẳng vào hàng chờ" : "Gửi yêu cầu cho host"}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <svg
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Tìm tên bài hoặc ca sĩ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px 8px 30px",
              background: "#232238",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              color: "white",
              fontSize: 12,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Genre filter */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                border: genre === g
                  ? "1px solid rgba(167,139,250,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: genre === g
                  ? "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(236,72,153,0.15))"
                  : "rgba(255,255,255,0.03)",
                color: genre === g ? "#c4b5fd" : "rgba(255,255,255,0.4)",
                transition: "all 0.15s",
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách bài */}
      <div
        className="songPickerScroll"
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "rgba(255,255,255,0.2)",
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Không tìm thấy bài nào
          </div>
        ) : (
          filtered.map((song) => {
            const done = requested.has(song.id);
            return (
              <div
                key={song.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.03)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {/* Ảnh bìa */}
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    backgroundImage: `url(${song.songAvatar})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundColor: "#312e81",
                    flexShrink: 0,
                  }}
                />

                {/* Tên bài / ca sĩ */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.88)",
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {song.songName}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.32)",
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {song.songArtist} · {song.genre}
                  </p>
                </div>

                {/* Thời lượng */}
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: "'DM Sans', sans-serif",
                    flexShrink: 0,
                  }}
                >
                  {song.duration}
                </span>

                {/* Nút thêm */}
                <button
                  onClick={() => !done && handleRequest(song)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: done ? "default" : "pointer",
                    flexShrink: 0,
                    transition: "all 0.15s",
                    border: done
                      ? "1px solid rgba(143, 65, 151, 0.3)"
                      : "1px solid rgba(167,139,250,0.35)",
                    background: done
                      ? "rgba(52,211,153,0.1)"
                      : "rgba(124,58,237,0.15)",
                    color: done ? "#34d399" : "#c4b5fd",
                  }}
                >
                  {done ? "✓ Đã thêm" : isHost ? "+ Thêm" : "Yêu cầu"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .songPickerScroll::-webkit-scrollbar { width: 5px; }
        .songPickerScroll::-webkit-scrollbar-track { background: transparent; }
        .songPickerScroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(124,58,237,0.6), rgba(236,72,153,0.6));
          border-radius: 999px;
        }
        .songPickerScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(167,139,250,0.5) transparent;
        }
      `}</style>
    </div>
  );
}