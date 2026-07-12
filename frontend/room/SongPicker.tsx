"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
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
    <div className="glass-card flex h-[420px] flex-col overflow-hidden rounded-card bg-surface/60">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-divider px-4 pb-3 pt-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Thư viện
          </span>
          <span className="ml-auto text-[10px] text-text-muted">
            {isHost ? "Thêm thẳng vào hàng chờ" : "Gửi yêu cầu cho host"}
          </span>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search
            size={13}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Tìm tên bài hoặc ca sĩ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-input border border-border bg-black/20 py-2 pl-8 pr-2.5 text-xs text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-key"
          />
        </div>

        {/* Genre filter */}
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              className={`rounded-full border px-2.5 py-[3px] text-[11px] transition-colors ${
                genre === g
                  ? "border-key bg-key text-white"
                  : "border-border bg-white/[0.03] text-text-muted hover:text-text-secondary"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách bài */}
      <div className="apple-scroll min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-text-muted">
            Không tìm thấy bài nào
          </div>
        ) : (
          filtered.map((song) => {
            const done = requested.has(song.id);
            return (
              <div
                key={song.id}
                className="flex items-center gap-2.5 border-b border-divider px-4 py-[9px] transition-colors hover:bg-white/[0.03]"
              >
                {/* Ảnh bìa */}
                <div
                  className="h-[38px] w-[38px] flex-shrink-0 rounded-md bg-cover bg-center bg-surface-strong"
                  style={{ backgroundImage: `url(${song.songAvatar})` }}
                />

                {/* Tên bài / ca sĩ */}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-medium text-text-primary">
                    {song.songName}
                  </p>
                  <p className="m-0 truncate text-[11px] text-text-muted">
                    {song.songArtist} · {song.genre}
                  </p>
                </div>

                {/* Thời lượng */}
                <span className="flex-shrink-0 text-[11px] text-text-muted">{song.duration}</span>

                {/* Nút thêm */}
                <button
                  onClick={() => !done && handleRequest(song)}
                  className={`flex flex-shrink-0 items-center gap-1 rounded-button border px-3 py-[5px] text-[11px] transition-colors ${
                    done
                      ? "cursor-default border-key-border bg-key-soft text-key"
                      : "cursor-pointer border-transparent bg-key text-white hover:brightness-110"
                  }`}
                >
                  {done ? (
                    <>
                      <Check size={11} strokeWidth={2.5} /> Đã thêm
                    </>
                  ) : isHost ? (
                    "+ Thêm"
                  ) : (
                    "Yêu cầu"
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}