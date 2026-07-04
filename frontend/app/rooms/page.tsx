"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

type Room = {
  roomId: string;
  hostId: string;
  roomName?: string;
  roomType?: "music" | "ktv";
  privacy?: "public" | "private";
  currentSong?: string;
  createdAt?: string;
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState("");
  const [enteringRoomId, setEnteringRoomId] = useState<string | null>(null);

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

  // Reset trạng thái "đang vào phòng" mỗi khi quay lại trang này
  // (ví dụ người dùng bấm nút back của trình duyệt sau khi router.push)
  useEffect(() => {
    setEnteringRoomId(null);
  }, []);

  useEffect(() => {
    async function loadRooms() {
      try {
        const res = await fetch("/api/rooms");

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
    <main className="min-h-screen bg-black px-6 py-10 text-white sm:px-10">
      <div className="mx-auto w-full max-w-4xl">
        {/* Thanh thông báo */}
        {notification && (
          <div className="mx-auto mb-6 max-w-xl rounded-xl bg-red-950/40 px-4 py-3 text-center text-sm text-red-400">
            {notification}
          </div>
        )}

        <h1 className="mb-10 text-3xl font-bold tracking-tight sm:text-4xl">
          Danh sách phòng
        </h1>

        {loading && <p className="py-2 italic text-white/30">Đang tải phòng...</p>}

        {!loading && (
          <>
            <RoomSection
              title="Phòng nghe nhạc"
              rooms={musicRooms}
              type="music"
              enteringRoomId={enteringRoomId}
              onEnter={setEnteringRoomId}
            />
            <RoomSection
              title="Phòng KTV"
              rooms={ktvRooms}
              type="ktv"
              enteringRoomId={enteringRoomId}
              onEnter={setEnteringRoomId}
            />
          </>
        )}
      </div>
    </main>
  );
}

function RoomSection({
  title,
  rooms,
  type,
  enteringRoomId,
  onEnter,
}: {
  title: string;
  rooms: Room[];
  type: "music" | "ktv";
  enteringRoomId: string | null;
  onEnter: (roomId: string | null) => void;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/50">
        {title}
      </h2>

      {rooms.length === 0 ? (
        <p className="py-2 italic text-white/30">Chưa có phòng nào.</p>
      ) : (
        <div className="grid gap-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.roomId}
              room={room}
              type={type}
              isEntering={enteringRoomId === room.roomId}
              onEnter={onEnter}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoomCard({
  room,
  type,
  isEntering,
  onEnter,
}: {
  room: Room;
  type: "music" | "ktv";
  isEntering: boolean;
  onEnter: (roomId: string | null) => void;
}) {
  const router = useRouter();

  const handleEnter = () => {
    if (isEntering) return;
    onEnter(room.roomId);

    try {
      router.push(`/${type === "music" ? "room" : "ktv"}/${room.roomId}`);
    } catch (err) {
      // Nếu điều hướng lỗi, không để nút bị kẹt ở trạng thái loading
      console.error("Lỗi điều hướng vào phòng:", err);
      onEnter(null);
    }
  };

  return (
    <div className="rounded-xl border border-[#1c1c1e] bg-[#121214] p-5 transition-all duration-200 hover:border-[#2c2c2e]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">
            {room.roomName || `Phòng của ${room.hostId}`}
          </h3>

          <p className="mt-3 text-xs text-white/40">
            Mã phòng: {room.roomId} · Host: {room.hostId}
          </p>
        </div>

        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-white/60">
          {room.privacy === "private" ? "🔒 Riêng tư" : "🌐 Công khai"}
        </span>
      </div>

      <motion.button
        onClick={handleEnter}
        disabled={isEntering}
        whileTap={isEntering ? undefined : { scale: 0.97 }}
        className="mt-4 flex w-28 shrink-0 items-center justify-center rounded-lg bg-[#fa243c] py-2 text-sm font-medium text-white transition-colors hover:enabled:bg-[#fa243c]/90 disabled:cursor-not-allowed disabled:bg-[#fa243c]/70"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isEntering ? (
            <motion.span
              key="spinner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex"
            >
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }}
                className="inline-flex"
              >
                <Loader2 className="h-4 w-4 text-white" />
              </motion.span>
            </motion.span>
          ) : (
            <motion.span
              key="label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Vào phòng
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}