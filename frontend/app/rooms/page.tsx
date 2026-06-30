"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Room = {
  roomId: string;
  hostId: string;
  roomType?: "music" | "ktv";
  privacy?: "public" | "private";
  currentSong?: string;
  createdAt?: string;
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState("");

  // Nhận diện thông báo từ localStorage khi mở trang
  useEffect(() => {
    const msg = localStorage.getItem("room_notification");

    if (msg) {
      setNotification(msg);
      localStorage.removeItem("room_notification");

      setTimeout(() => {
        setNotification("");
      }, 5000);
    }
  }, []);

  useEffect(() => {
    async function loadRooms() {
      try {
        const res = await fetch("http://localhost:8080/rooms");
        
        // Nếu API trả về code 4xx hoặc 5xx, chủ động nhảy vào catch
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        // Cập nhật bảo vệ theo logic của bạn
        setRooms(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Lỗi lấy danh sách phòng:", err);
        setRooms([]); // Đảm bảo rooms luôn là mảng rỗng nếu lỗi
      } finally {
        setLoading(false);
      }
    }

    loadRooms();
  }, []);

  // Lọc danh sách phòng an toàn
  const musicRooms = rooms.filter((r) => r.roomType !== "ktv");
  const ktvRooms = rooms.filter((r) => r.roomType === "ktv");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#080412",
        color: "white",
        padding: 32,
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Hiển thị banner thông báo bị từ chối trên đầu trang */}
      {notification && (
        <div
          style={{
            background: "#3b0505",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 20,
            border: "1px solid #320337",
            fontWeight: 600,
          }}
        >
          ❌ {notification}
        </div>
      )}

      <h1>Danh sách phòng</h1>

      {loading && <p>Đang tải phòng...</p>}

      {!loading && (
        <>
          <RoomSection title="🎧 Phòng nghe nhạc" rooms={musicRooms} type="music" />
          <RoomSection title="🎤 Phòng KTV" rooms={ktvRooms} type="ktv" />
        </>
      )}
    </main>
  );
}

function RoomSection({
  title,
  rooms,
  type,
}: {
  title: string;
  rooms: Room[];
  type: "music" | "ktv";
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2>{title}</h2>

      {rooms.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.45)" }}>Chưa có phòng nào.</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {rooms.map((room) => (
            <div
              key={room.roomId}
              style={{
                padding: 20,
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Phòng: {room.roomId}</h3>

              <p>Host: {room.hostId}</p>
              <p>
                Chế độ:{" "}
                {room.privacy === "private" ? "🔒 Riêng tư" : "🌐 Công khai"}
              </p>

              <Link
                href={`/${type === "music" ? "room" : "ktv"}/${room.roomId}`}
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  padding: "10px 16px",
                  borderRadius: 12,
                  color: "white",
                  textDecoration: "none",
                  background: "linear-gradient(135deg, #6d28d9, #be185d)",
                }}
              >
                Vào phòng
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}