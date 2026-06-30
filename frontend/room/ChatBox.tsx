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
          style={{
            width: 120,
            height: 120,
            borderRadius: 12,
            objectFit: "cover",
            display: "block",
          }}
        />
      );
    }

    return content;
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: 0.45,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "white",
                display: "inline-block",
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.3,
          }}
        >
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: "white",
              margin: 0,
            }}
          >
            Chưa có tin nhắn
          </p>
        </div>
      );
    }

    return messages.map((msg, i) => {
      const isSticker = typeof msg.content === "string" && msg.content.startsWith("[sticker]");
      const userName = msg.isMine ? "Bạn" : msg.userName || "Khách";

      return (
        <div
          key={msg.id ?? msg._id ?? i}
          style={{
            width: "100%",
            display: "flex",
            // row-reverse để đẩy tin nhắn của bạn sang phải, row giữ tin nhắn người khác bên trái
            flexDirection: msg.isMine ? "row-reverse" : "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          {/* Giữ nguyên thẻ img avatar tròn tròn ban đầu của bạn */}
          <img
            src={msg.avatarUrl || "https://i.pravatar.cc/100"} 
            alt=""
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              background: "#444",
            }}
          />

          {/* Vùng văn bản nội dung */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              // flex-end để căn tên và khung chat sang phải nếu là tin nhắn của bạn
              alignItems: msg.isMine ? "flex-end" : "flex-start",
              maxWidth: "80%",
            }}
          >
            {/* Tên người gửi - Chữ trắng, đậm, cỡ chữ 15px như mẫu */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#ffffff",
                marginBottom: 4,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {userName}
            </div>

            {/* Khối khung hội thoại (Bubble chat xám đồng bộ) */}
            <div
              style={{
                padding: isSticker ? 4 : "10px 14px",
                borderRadius: 14,
                background: isSticker
                  ? "transparent"
                  : "rgba(60, 60, 60, 0.85)", 
                border: isSticker
                  ? "none"
                  : "1px solid rgba(255,255,255,0.05)",
                color: "#ffffff",
                fontSize: 14,
                lineHeight: 1.5,
                fontFamily: "'DM Sans', sans-serif",
                wordBreak: "break-word",
              }}
            >
              {renderMessageContent(msg.content)}
            </div>

            {/* Thời gian gửi tin nhắn */}
            {(msg.timestamp || msg.createdAt) && (
              <span
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {formatTime(msg.timestamp, msg.createdAt)}
              </span>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: 520, 
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(255,255,255,0.02)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 13,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          Tin nhắn
        </span>

        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "rgba(255,255,255,0.22)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {isLoading ? "..." : `${messages.length} tin`}
        </span>
      </div>

      {/* Vùng cuộn tin nhắn */}
      <div
        className={styles.chatScroll} 
        style={{
          flex: 1,          
          minHeight: 0,     
          overflowY: "auto",
          overflowX: "hidden",
          padding: "16px 18px 16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          scrollBehavior: "smooth",
        }}
      >
        {renderBody()}
        <div ref={chatEndRef} />
      </div>

      {/* Thanh công cụ nhập liệu */}
      <div
        style={{
          position: "relative",
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          gap: 10,
          alignItems: "center",
          background: "rgba(0,0,0,0.22)",
          flexShrink: 0,
        }}
      >
        {showEmoji && (
          <div
            style={{
              position: "absolute",
              bottom: 62,
              left: 12,
              zIndex: 999,
            }}
          >
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
            className="sticker-scroll"
            style={{
              position: "absolute",
              bottom: 62,
              left: 65,
              width: 320,
              maxHeight: 320,
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(167,139,250,0.6) transparent",
              padding: 12,
              borderRadius: 16,
              background: "rgba(20,20,30,0.96)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 10,
              zIndex: 999,
              boxShadow: "0 12px 35px rgba(0,0,0,0.35)",
            }}
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
                style={{
                  border: "none",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: 6,
                  cursor: "pointer",
                }}
              >
                <img
                  src={sticker}
                  alt=""
                  style={{
                    width: "100%",
                    height: 70,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
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
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            color: "white",
            fontSize: 20,
          }}
        >
          😊
        </button>

        <button
          type="button"
          onClick={() => {
            setShowSticker(!showSticker);
            setShowEmoji(false);
          }}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            color: "white",
            fontSize: 18,
          }}
        >
          🖼️
        </button>

        <input
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhắn gì đó..."
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "10px 14px",
            color: "white",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
            minWidth: 0,
          }}
        />

        <button
          onClick={() => {
            onSend();
            setShowEmoji(false);
            setShowSticker(false);
          }}
          disabled={!chatText.trim()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: chatText.trim()
              ? "linear-gradient(135deg, #7c3aed, #ec4899)"
              : "rgba(255,255,255,0.05)",
            border: "none",
            cursor: chatText.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "white",
            opacity: chatText.trim() ? 1 : 0.45,
            transition: "0.2s ease",
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}