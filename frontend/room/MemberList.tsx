"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { Participant } from "../types/websocket";

interface MemberListProps {
  participants: Participant[];
}

export default function MemberList({ participants }: MemberListProps) {
  return (
    <aside className="glass-card flex h-[420px] flex-col overflow-hidden rounded-card bg-surface/60">
      {/* Header (cố định, không scroll) */}
      <div className="flex-shrink-0 px-4 pb-4 pt-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-key opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-key" />
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Thành viên
          </span>
        </div>
        <p className="m-0 text-[26px] font-semibold leading-none text-text-primary">
          {participants.length}
          <span className="ml-1.5 text-[13px] font-normal text-text-muted">online</span>
        </p>

        <div className="mt-4 h-px bg-divider" />
      </div>

      {/* Danh sách thành viên — vùng duy nhất được scroll */}
      <div className="apple-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-4">
        {participants.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center text-[13px] text-text-muted">
            Chưa có thành viên
          </div>
        ) : (
          participants.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex flex-shrink-0 cursor-default items-center gap-3 rounded-input px-3 py-2.5 transition-colors ${
                p.isHost ? "bg-key-soft" : "hover:bg-white/[0.03]"
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-avatar text-sm font-semibold ${
                  p.isHost ? "bg-key text-white" : "bg-surface-strong text-text-secondary"
                }`}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 overflow-hidden">
                <p
                  className={`m-0 truncate text-[13px] font-medium ${
                    p.isHost ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {p.name}
                </p>
                {p.isHost && (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] text-key">
                    <Crown size={10} fill="currentColor" strokeWidth={0} />
                    Host
                  </span>
                )}
              </div>

              {/* Online indicator */}
              <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-key" />
            </motion.div>
          ))
        )}
      </div>
    </aside>
  );
}