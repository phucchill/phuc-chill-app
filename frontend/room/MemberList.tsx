"use client";

import { Participant } from "../types/websocket";

interface MemberListProps {
  participants: Participant[];
}

export default function MemberList({ participants }: MemberListProps) {
  return (
    <aside
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 20,
        height: 480,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header (cố định, không scroll) */}
      <div style={{ padding: "24px 16px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#a78bfa",
              boxShadow: "0 0 8px #a78bfa",
              animation: "pulse 2s infinite",
            }}
          />
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 14,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            Thành viên
          </span>
        </div>
        <p
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 28,
            fontWeight: 700,
            color: "white",
            margin: 0,
            lineHeight: 1,
          }}
        >
          {participants.length}
          <span
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.3)",
              fontWeight: 400,
              marginLeft: 6,
              letterSpacing: "0.05em",
            }}
          >
            online
          </span>
        </p>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.3), transparent)",
            marginTop: 20,
          }}
        />
      </div>

      {/* Danh sách thành viên — vùng duy nhất được scroll, khung ngoài luôn giữ nguyên kích thước */}
      <div
        className="memberScroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {participants.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "rgba(255,255,255,0.2)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
            }}
          >
            Chưa có thành viên
          </div>
        ) : (
          participants.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 12,
                flexShrink: 0,
                background: p.isHost
                  ? "linear-gradient(135deg, rgba(167,139,250,0.12), rgba(236,72,153,0.08))"
                  : "rgba(255,255,255,0.03)",
                border: p.isHost
                  ? "1px solid rgba(167,139,250,0.2)"
                  : "1px solid rgba(255,255,255,0.04)",
                transition: "all 0.2s ease",
                cursor: "default",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: p.isHost
                    ? "linear-gradient(135deg, #7c3aed, #ec4899)"
                    : "linear-gradient(135deg, #374151, #4b5563)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "white",
                  flexShrink: 0,
                  fontFamily: "'Cormorant Garamond', serif",
                  boxShadow: p.isHost ? "0 0 12px rgba(124,58,237,0.4)" : "none",
                }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, overflow: "hidden" }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: 500,
                    color: p.isHost ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.name}
                </p>
                {p.isHost && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#a78bfa",
                      fontFamily: "'DM Sans', sans-serif",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Host
                  </span>
                )}
              </div>

              {/* Online indicator */}
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#34d399",
                  boxShadow: "0 0 6px #34d399",
                  flexShrink: 0,
                }}
              />
            </div>
          ))
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        .memberScroll::-webkit-scrollbar {
          width: 6px;
        }
        .memberScroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .memberScroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(124,58,237,0.7), rgba(236,72,153,0.7));
          border-radius: 999px;
        }
        .memberScroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(167,139,250,0.65) transparent;
        }
      `}</style>
    </aside>
  );
}