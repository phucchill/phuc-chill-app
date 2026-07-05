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
    <div className="flex h-[420px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#111113]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/5 px-[18px] pb-2.5 pt-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="font-serif text-[13px] uppercase tracking-[0.15em] text-white/40">
            Chọn bài hát
          </span>
          <span className="ml-auto font-sans text-[10px] text-white/25">
            {isHost ? "Thêm thẳng vào hàng chờ" : "Gửi yêu cầu cho host"}
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
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
            className="box-border w-full rounded-[10px] border border-white/5 bg-black/40 py-2 pl-[30px] pr-2.5 font-sans text-xs text-white outline-none placeholder:text-white/25"
          />
        </div>

        {/* Genre filter */}
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              className={`rounded-full border px-2.5 py-[3px] font-sans text-[11px] transition-colors ${
                genre === g
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/60"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách bài */}
      <div className="songPickerScroll min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center font-sans text-[13px] text-white/20">
            Không tìm thấy bài nào
          </div>
        ) : (
          filtered.map((song) => {
            const done = requested.has(song.id);
            return (
              <div
                key={song.id}
                className="flex items-center gap-2.5 border-b border-white/[0.03] px-4 py-[9px] transition-colors hover:bg-white/[0.03]"
              >
                {/* Ảnh bìa */}
                <div
                  className="h-[38px] w-[38px] flex-shrink-0 rounded-lg bg-cover bg-center bg-[#1a1a1c]"
                  style={{ backgroundImage: `url(${song.songAvatar})` }}
                />

                {/* Tên bài / ca sĩ */}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-sans text-[13px] font-medium text-white/90">
                    {song.songName}
                  </p>
                  <p className="m-0 truncate font-sans text-[11px] text-white/30">
                    {song.songArtist} · {song.genre}
                  </p>
                </div>

                {/* Thời lượng */}
                <span className="flex-shrink-0 font-sans text-[11px] text-white/25">
                  {song.duration}
                </span>

                {/* Nút thêm */}
                <button
                  onClick={() => !done && handleRequest(song)}
                  className={`flex-shrink-0 rounded-lg border px-3 py-[5px] font-sans text-[11px] transition-colors ${
                    done
                      ? "cursor-default border-white/10 bg-white/5 text-white/40"
                      : "cursor-pointer border-white bg-white text-black hover:bg-white/90"
                  }`}
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
          background: rgba(255,255,255,0.15);
          border-radius: 999px;
        }
        .songPickerScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
      `}</style>
    </div>
  );
}