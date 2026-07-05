"use client";

import { RefObject, KeyboardEvent, useState } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { ChatMessage } from "../types/websocket";
import styles from "./ChatBox.module.css";

interface ExtendedChatMessage extends ChatMessage {
  avatarUrl?: string;
}

interface ChatBoxProps {
  messages: ExtendedChatMessage[];
  chatText: string;
  setChatText: (text: string) => void;
  onSend: (customText?: string) => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
  isLoading?: boolean;
}

const stickers = [
  "https://media.giphy.com/media/l4FGuhL4U2WyjdkaY/giphy.gif",
  "https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif",
  "https://media.giphy.com/media/QBd2kLB5qDmysEXre9/giphy.gif",
  "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
  "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif",
  "https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif",
  "https://media.giphy.com/media/LmNwrBhejkK9EFP504/giphy.gif",
  "https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/giphy.gif",
  "https://media.giphy.com/media/l3vR85PnGsBwu1PFK/giphy.gif",
  "https://media.giphy.com/media/fAnEC88LccN7a/giphy.gif",
  "https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif",
  "https://media.giphy.com/media/3oEduSbSGpGaRX2Vri/giphy.gif",
  "https://media.giphy.com/media/KztT2c4u8mYYUiMKdJ/giphy.gif",
  "https://media0.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3b2NldDNoYzV2Zng2OG4yYWdwN2tpNnlka2ZuMTlwYWE5ZGJyenJ2cCZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/OfkGZ5H2H3f8Y/giphy.webp",
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExc2dtNDZyeXdranNrbzd4NzV2OGkxbDFvOWYwMzlidDZhbm1zMzlnbSZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/fUQ4rhUZJYiQsas6WD/200.webp",
  "https://media4.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3b2NldDNoYzV2Zng2OG4yYWdwN2tpNnlka2ZuMTlwYWE5ZGJyenJ2cCZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/s822vUIAvfoU422iKQ/giphy.webp",
];

export default function ChatBox({
  messages,
  chatText,
  setChatText,
  onSend,
  chatEndRef,
  isLoading = false,
}: ChatBoxProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSticker, setShowSticker] = useState(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
      setShowEmoji(false);
      setShowSticker(false);
    }
  };

  const formatTime = (ts?: number, createdAt?: string) => {
    const date = ts ? new Date(ts) : createdAt ? new Date(createdAt) : null;
    if (!date) return "";

    return date.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderMessageContent = (content?: string) => {
    if (typeof content === "string" && content.startsWith("[sticker]")) {
      const stickerUrl = content.replace("[sticker]", "");

      return (
        <img
          src={stickerUrl}
          alt="sticker"
          className="block h-[120px] w-[120px] rounded-xl object-cover"
        />
      );
    }

    return content;
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center gap-2 opacity-45">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-1.5 w-1.5 rounded-full bg-white"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center opacity-30">
          <p className="m-0 font-sans text-[13px] text-white">Chưa có tin nhắn</p>
        </div>
      );
    }

    return messages.map((msg, i) => {
      const isSticker = typeof msg.content === "string" && msg.content.startsWith("[sticker]");
      const userName = msg.isMine ? "Bạn" : msg.userName || "Khách";

      return (
        <div
          key={msg.id ?? msg._id ?? i}
          className={`flex w-full items-start gap-2.5 ${msg.isMine ? "flex-row-reverse" : "flex-row"}`}
        >
          <img
            src={msg.avatarUrl || "https://i.pravatar.cc/100"}
            alt=""
            className="h-[38px] w-[38px] flex-shrink-0 rounded-full bg-[#222] object-cover"
          />

          <div
            className={`flex max-w-[80%] flex-col ${msg.isMine ? "items-end" : "items-start"}`}
          >
            <div className="mb-1 font-sans text-sm font-bold text-white">{userName}</div>

            <div
              className={`font-sans text-sm leading-relaxed text-white break-words ${
                isSticker
                  ? "rounded-xl bg-transparent p-1"
                  : "rounded-xl border border-white/5 bg-white/[0.06] px-3.5 py-2.5"
              }`}
            >
              {renderMessageContent(msg.content)}
            </div>

            {(msg.timestamp || msg.createdAt) && (
              <span className="mt-1 font-sans text-[11px] text-white/30">
                {formatTime(msg.timestamp, msg.createdAt)}
              </span>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex h-[780px] flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#111113]">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-white/5 px-6 py-4">
        <span className="font-serif text-[13px] uppercase tracking-[0.15em] text-white/40">
          Tin nhắn
        </span>

        <span className="ml-auto font-sans text-[11px] text-white/25">
          {isLoading ? "..." : `${messages.length} tin`}
        </span>
      </div>

      {/* Vùng cuộn tin nhắn */}
      <div
        className={`${styles.chatScroll} flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-[18px] py-4 pl-5`}
        style={{ scrollBehavior: "smooth" }}
      >
        {renderBody()}
        <div ref={chatEndRef} />
      </div>

      {/* Thanh công cụ nhập liệu */}
      <div className="relative flex flex-shrink-0 items-center gap-2.5 border-t border-white/5 bg-black/40 px-4 py-3">
        {showEmoji && (
          <div className="absolute bottom-[62px] left-3 z-[999]">
            <EmojiPicker
              theme={Theme.DARK}
              onEmojiClick={(emojiData) => {
                setChatText(chatText + emojiData.emoji);
              }}
            />
          </div>
        )}

        {showSticker && (
          <div
            className="sticker-scroll absolute bottom-[62px] left-[65px] z-[999] grid max-h-80 w-80 grid-cols-3 gap-2.5 overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0c0e] p-3"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}
          >
            {stickers.map((sticker) => (
              <button
                key={sticker}
                type="button"
                onClick={() => {
                  onSend(`[sticker]${sticker}`);
                  setShowSticker(false);
                  setShowEmoji(false);
                }}
                className="cursor-pointer rounded-xl border-none bg-white/5 p-1.5 hover:bg-white/10"
              >
                <img
                  src={sticker}
                  alt=""
                  className="h-[70px] w-full rounded-lg object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setShowEmoji(!showEmoji);
            setShowSticker(false);
          }}
          className="h-10 w-10 cursor-pointer rounded-xl border border-white/5 bg-white/5 text-xl text-white hover:bg-white/10"
        >
          😊
        </button>

        <button
          type="button"
          onClick={() => {
            setShowSticker(!showSticker);
            setShowEmoji(false);
          }}
          className="h-10 w-10 cursor-pointer rounded-xl border border-white/5 bg-white/5 text-lg text-white hover:bg-white/10"
        >
          🖼️
        </button>

        <input
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhắn gì đó..."
          className="min-w-0 flex-1 rounded-xl border border-white/5 bg-white/5 px-3.5 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/30"
        />

        <button
          onClick={() => {
            onSend();
            setShowEmoji(false);
            setShowSticker(false);
          }}
          disabled={!chatText.trim()}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border-none text-white transition-opacity ${
            chatText.trim()
              ? "cursor-pointer bg-white/15 opacity-100 hover:bg-white/25"
              : "cursor-not-allowed bg-white/5 opacity-45"
          }`}
        >
          ➤
        </button>
      </div>
    </div>
  );
}