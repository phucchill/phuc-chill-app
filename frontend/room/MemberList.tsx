"use client";

import { Participant } from "../types/websocket";

interface MemberListProps {
  participants: Participant[];
}

export default function MemberList({ participants }: MemberListProps) {
  return (
    <aside className="flex h-[480px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#111113]">
      {/* Header (cố định, không scroll) */}
      <div className="flex-shrink-0 px-4 pb-4 pt-6">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-white/60" />
          <span className="font-serif text-sm uppercase tracking-[0.15em] text-white/40">
            Thành viên
          </span>
        </div>
        <p className="m-0 font-serif text-[28px] font-bold leading-none text-white">
          {participants.length}
          <span className="ml-1.5 text-[13px] font-normal tracking-[0.05em] text-white/30">
            online
          </span>
        </p>

        {/* Divider */}
        <div className="mt-5 h-px bg-white/10" />
      </div>

      {/* Danh sách thành viên — vùng duy nhất được scroll, khung ngoài luôn giữ nguyên kích thước */}
      <div className="memberScroll flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-4">
        {participants.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center font-sans text-[13px] text-white/20">
            Chưa có thành viên
          </div>
        ) : (
          participants.map((p) => (
            <div
              key={p.id}
              className={`flex flex-shrink-0 cursor-default items-center gap-3 rounded-xl border px-3 py-2.5 ${
                p.isHost ? "border-white/15 bg-white/[0.06]" : "border-white/5 bg-white/[0.03]"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-serif text-sm font-bold ${
                  p.isHost ? "bg-white text-black" : "bg-white/10 text-white"
                }`}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 overflow-hidden">
                <p
                  className={`m-0 truncate font-sans text-[13px] font-medium ${
                    p.isHost ? "text-white/95" : "text-white/70"
                  }`}
                >
                  {p.name}
                </p>
                {p.isHost && (
                  <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/50">
                    Host
                  </span>
                )}
              </div>

              {/* Online indicator */}
              <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
            </div>
          ))
        )}
      </div>

      <style>{`
        .memberScroll::-webkit-scrollbar {
          width: 6px;
        }
        .memberScroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .memberScroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 999px;
        }
        .memberScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
      `}</style>
    </aside>
  );
}