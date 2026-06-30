"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type RoomPrivacy = "public" | "private";
type RoomType = "music" | "ktv";

export default function CreateRoomPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);   // ← thêm

  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const [privacy, setPrivacy] = useState<RoomPrivacy>("public");
  const [roomType, setRoomType] = useState<RoomType>("music");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMounted(true);                              // ← thêm
    const savedUser = localStorage.getItem("userName");
    if (savedUser) setUserName(savedUser);
    setRoomId(`ROOM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
  }, []);

  const getRoomUrl = () => {
    if (!mounted) return "";                       // ← đổi từ typeof window === "undefined"
    const path = roomType === "music" ? "room" : "ktv";
    return `${window.location.origin}/${path}/${roomId}`;
  };

  const getQRUrl = () =>
    `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
      getRoomUrl()
    )}&bgcolor=ffffff&color=000000&margin=8`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(getRoomUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const createRoom = async () => {
    if (!userName.trim()) {
      setError("Nhập tên nghệ danh của bạn");
      return;
    }

    if (!roomName.trim()) {
      setError("Nhập tên phòng");
      return;
    }

    setError("");
    setIsLoading(true);

    let userId = localStorage.getItem("userId");
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem("userId", userId);
    }

    localStorage.setItem("userName", userName.trim());
    localStorage.setItem("roomName", roomName.trim());
    localStorage.setItem("roomType", roomType);
    localStorage.setItem("roomPrivacy", privacy);
    localStorage.setItem("isHost", "true");

    try {
      const res = await fetch("http://localhost:8080/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          roomName: roomName.trim(),
          roomType,
          privacy,
          hostId: userId,
        }),
      });

      if (!res.ok) throw new Error();

      router.push(roomType === "music" ? `/room/${roomId}` : `/ktv/${roomId}`);
    } catch {
      setError("Không kết nối được máy chủ. Thử lại.");
      setIsLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="layout">
        <div className="preview">
          <div className="glow glow-1" />
          <div className="glow glow-2" />

          <div className="brand">
            <div className="logo">
              <Image src="/logo/logo.png" alt="logo" width={34} height={34} priority />
            </div>

            <div>
              <p>Music Room</p>
              <h1>Tạo phòng nghe nhạc riêng</h1>
            </div>
          </div>

          <div className="cover-card">
            <div className="cover-art">
              <Image
                src="/images/music-cover.jpg"
                alt="music cover"
                fill
                priority
                className="cover-img"
              />
              <div className="cover-shade" />
              <div className="play-btn">▶</div>
            </div>

            <div className="song-info">
              <span>Đang phát thử</span>
              <h2>Chill Room</h2>
              <p>Kết nối bạn bè qua âm nhạc</p>
            </div>
          </div>

          <div className="features">
            <Feature icon="🎧" title="Nghe nhạc chung" />
            <Feature icon="💬" title="Chat realtime" />
            <Feature icon="🎤" title="Phòng KTV" />
          </div>
        </div>

        <div className="form-card">
          <div className="form-head">
            <p>Tạo phòng mới</p>
            <h2>Bắt đầu không gian của bạn</h2>
          </div>

          <Field label="Nghệ danh">
            <Input
              value={userName}
              onChange={(v) => {
                setUserName(v);
                setError("");
              }}
              placeholder="Tên của bạn"
            />
          </Field>

          <Field label="Tên phòng">
            <Input
              value={roomName}
              onChange={(v) => {
                setRoomName(v);
                setError("");
              }}
              placeholder="VD: Chill tối nay"
            />
          </Field>

          <Field label="Loại phòng">
            <Segmented
              value={roomType}
              onChange={(v) => setRoomType(v as RoomType)}
              options={[
                { id: "music", label: "Nghe nhạc" },
                { id: "ktv", label: "KTV" },
              ]}
            />
          </Field>

          <Field label="Quyền truy cập">
            <Segmented
              value={privacy}
              onChange={(v) => setPrivacy(v as RoomPrivacy)}
              options={[
                { id: "public", label: "Công khai" },
                { id: "private", label: "Riêng tư" },
              ]}
            />
          </Field>

          <div className="invite">
            <div className="invite-info">
              <span>Mã phòng</span>

              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              />

              <p>{getRoomUrl()}</p>

              <button type="button" onClick={copyLink}>
                {copied ? "Đã sao chép" : "Sao chép liên kết"}
              </button>
            </div>

            {roomId && (
              <div className="qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getQRUrl()} alt="QR code" />
              </div>
            )}
          </div>

          {error && <p className="error">⚠ {error}</p>}

          <button className="submit" onClick={createRoom} disabled={isLoading}>
            {isLoading ? "Đang tạo..." : "Tạo phòng"}
          </button>

          <button className="back" onClick={() => router.back()} disabled={isLoading}>
            Quay lại
          </button>
        </div>
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background:
            radial-gradient(circle at top left, rgba(190, 120, 255, 0.18), transparent 34%),
            radial-gradient(circle at bottom right, rgba(255, 190, 90, 0.14), transparent 30%),
            linear-gradient(135deg, #08080b, #111014 55%, #08080b);
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .layout {
          width: 100%;
          max-width: 1040px;
          display: grid;
          grid-template-columns: 1.08fr 0.92fr;
          gap: 22px;
        }

        .preview,
        .form-card {
          border-radius: 34px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          background: rgba(18, 18, 22, 0.72);
          backdrop-filter: blur(26px);
          box-shadow: 0 34px 100px rgba(0, 0, 0, 0.48);
        }

        .preview {
          position: relative;
          overflow: hidden;
          min-height: 620px;
          padding: 34px;
        }

        .glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(35px);
          opacity: 0.55;
        }

        .glow-1 {
          width: 240px;
          height: 240px;
          background: rgba(170, 88, 255, 0.35);
          top: -70px;
          right: -50px;
        }

        .glow-2 {
          width: 220px;
          height: 220px;
          background: rgba(255, 190, 90, 0.22);
          bottom: -70px;
          left: -50px;
        }

        .brand {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo {
          width: 62px;
          height: 62px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .brand p,
        .form-head p {
          margin: 0 0 6px;
          color: #d8b978;
          font-size: 13px;
          font-weight: 700;
        }

        .brand h1 {
          margin: 0;
          max-width: 430px;
          font-size: 42px;
          line-height: 1.02;
          letter-spacing: -0.05em;
        }

        .cover-card {
          position: relative;
          z-index: 2;
          margin-top: 54px;
          padding: 18px;
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.065);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .cover-art {
          position: relative;
          height: 310px;
          border-radius: 24px;
          overflow: hidden;
          background: #111;
        }

        .cover-img {
          object-fit: cover;
        }

        .cover-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent 20%, rgba(0, 0, 0, 0.78));
        }

        .play-btn {
          position: absolute;
          right: 22px;
          bottom: 22px;
          width: 58px;
          height: 58px;
          border-radius: 999px;
          background: linear-gradient(135deg, #f4d28c, #a97932);
          color: #111;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42);
        }

        .song-info {
          padding: 18px 4px 4px;
        }

        .song-info span {
          color: #d8b978;
          font-size: 13px;
        }

        .song-info h2 {
          margin: 7px 0 4px;
          font-size: 28px;
        }

        .song-info p {
          margin: 0;
          color: rgba(255, 255, 255, 0.58);
        }

        .features {
          position: relative;
          z-index: 2;
          margin-top: 20px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .form-card {
          padding: 28px;
        }

        .form-head {
          margin-bottom: 22px;
        }

        .form-head h2 {
          margin: 0;
          font-size: 30px;
          letter-spacing: -0.04em;
        }

        .invite {
          display: flex;
          gap: 14px;
          align-items: center;
          margin: 20px 0 16px;
          padding: 14px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.055);
          border: 1px solid rgba(255, 255, 255, 0.075);
        }

        .invite-info {
          flex: 1;
          min-width: 0;
        }

        .invite-info span {
          display: block;
          color: rgba(255, 255, 255, 0.48);
          font-size: 12px;
          margin-bottom: 8px;
        }

        .invite-info input {
          width: 100%;
          border: 0;
          outline: none;
          background: transparent;
          color: white;
          font-size: 21px;
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .invite-info p {
          margin: 6px 0 12px;
          color: rgba(255, 255, 255, 0.42);
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .invite-info button {
          border: 0;
          height: 36px;
          border-radius: 999px;
          padding: 0 14px;
          background: rgba(255, 255, 255, 0.09);
          color: white;
          cursor: pointer;
        }

        .qr {
          width: 88px;
          height: 88px;
          border-radius: 20px;
          padding: 8px;
          background: white;
          flex-shrink: 0;
        }

        .qr img {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 12px;
        }

        .error {
          color: #ff9aa9;
          font-size: 13px;
          margin: 0 0 14px;
        }

        .submit {
          width: 100%;
          height: 56px;
          border: 0;
          border-radius: 18px;
          background: linear-gradient(135deg, #f4d28c, #a97932);
          color: #111;
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
          box-shadow: 0 18px 44px rgba(201, 151, 72, 0.2);
        }

        .submit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .back {
          width: 100%;
          height: 46px;
          margin-top: 10px;
          border: 0;
          border-radius: 16px;
          background: transparent;
          color: rgba(255, 255, 255, 0.48);
          cursor: pointer;
        }

        .back:hover {
          color: white;
          background: rgba(255, 255, 255, 0.045);
        }

        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
            max-width: 470px;
          }

          .preview {
            min-height: auto;
          }

          .brand h1 {
            font-size: 32px;
          }

          .cover-art {
            height: 230px;
          }
        }

        @media (max-width: 480px) {
          .page {
            padding: 14px;
          }

          .preview,
          .form-card {
            border-radius: 28px;
            padding: 20px;
          }

          .features {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}

      <style jsx>{`
        .field {
          margin-bottom: 16px;
        }

        label {
          display: block;
          margin-bottom: 8px;
          color: rgba(255, 255, 255, 0.52);
          font-size: 12px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />

      <style jsx>{`
        .input {
          width: 100%;
          height: 54px;
          border: 0;
          outline: none;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.06);
          color: white;
          padding: 0 16px;
          font-size: 15px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.32);
        }

        .input:focus {
          background: rgba(255, 255, 255, 0.085);
          box-shadow:
            inset 0 0 0 1px rgba(244, 210, 140, 0.45),
            0 0 0 4px rgba(244, 210, 140, 0.08);
        }
      `}</style>
    </>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={value === option.id ? "active" : ""}
        >
          {option.label}
        </button>
      ))}

      <style jsx>{`
        .segmented {
          height: 50px;
          padding: 4px;
          display: flex;
          gap: 4px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.06);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
        }

        button {
          flex: 1;
          border: 0;
          border-radius: 14px;
          background: transparent;
          color: rgba(255, 255, 255, 0.52);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        button.active {
          background: linear-gradient(135deg, #f4d28c, #a97932);
          color: #111;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.26);
        }
      `}</style>
    </div>
  );
}

function Feature({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="feature">
      <span>{icon}</span>
      <p>{title}</p>

      <style jsx>{`
        .feature {
          min-height: 86px;
          border-radius: 22px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.055);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        span {
          font-size: 22px;
        }

        p {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.72);
          font-size: 13px;
          font-weight: 650;
        }
      `}</style>
    </div>
  );
}