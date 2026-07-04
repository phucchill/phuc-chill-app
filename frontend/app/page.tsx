"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, type Variants } from "framer-motion";

type RoomPrivacy = "public" | "private";
type RoomType = "music" | "ktv";

type Particle = {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  note: boolean;
};

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const navVariants: Variants = {
  hidden: { y: -40, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.15 } },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const titleContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.018, delayChildren: 0.4 } },
};

const titleChar: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ------------------------------------------------------------------ */
/*  Animated heading — reveals letter by letter                        */
/* ------------------------------------------------------------------ */

function AnimatedHeading({ text }: { text: string }) {
  return (
    <motion.h1
      variants={titleContainer}
      initial="hidden"
      animate="visible"
      className="mb-8 text-3xl font-bold tracking-tight sm:text-4xl"
      aria-label={text}
    >
      {text.split("").map((char, i) => (
        <motion.span key={i} variants={titleChar} className="inline-block">
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </motion.h1>
  );
}

/* ------------------------------------------------------------------ */
/*  Spotlight panel — glass card with a glow that follows the cursor   */
/* ------------------------------------------------------------------ */

function SpotlightPanel({
  className,
  variants,
  children,
}: {
  className?: string;
  variants?: Variants;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--spot-x", `${x}%`);
    el.style.setProperty("--spot-y", `${y}%`);
  };

  return (
    <motion.div
      ref={ref}
      variants={variants}
      onMouseMove={handleMove}
      style={{
        // @ts-expect-error custom property
        "--spot-x": "50%",
        "--spot-y": "50%",
      }}
      className={`spotlight-panel relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] backdrop-blur-2xl ${className ?? ""}`}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function CreateRoomPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const [privacy, setPrivacy] = useState<RoomPrivacy>("public");
  const [roomType, setRoomType] = useState<RoomType>("music");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);

  // Ambient background layer reacts to the pointer for depth (parallax aurora).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const aurora1X = useTransform(mx, [0, 1], [-24, 24]);
  const aurora1Y = useTransform(my, [0, 1], [-16, 16]);
  const aurora2X = useTransform(mx, [0, 1], [20, -20]);
  const aurora2Y = useTransform(my, [0, 1], [14, -14]);
  const aurora3X = useTransform(mx, [0, 1], [-14, 14]);
  const aurora3Y = useTransform(my, [0, 1], [10, -10]);

  const handlePointerMove = (e: React.MouseEvent<HTMLElement>) => {
    mx.set(e.clientX / window.innerWidth);
    my.set(e.clientY / window.innerHeight);
  };

  // Hydration-safe: anything random (room code, ambient particles) is only
  // ever generated on the client, after the first paint, so server and
  // client markup always match on mount.
  useEffect(() => {
    setMounted(true);
    const savedUser = localStorage.getItem("userName");
    if (savedUser) setUserName(savedUser);
    setRoomId(`ROOM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`);

    setParticles(
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 3 + Math.random() * 6,
        duration: 14 + Math.random() * 14,
        delay: Math.random() * -20,
        note: Math.random() > 0.72,
      }))
    );
  }, []);

  const getRoomUrl = () => {
    if (!mounted) return "";
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

    function generateNumericId() {
      const timestamp = Date.now().toString();
      const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
      return parseInt(timestamp + randomDigits);
    }

    let userId = localStorage.getItem("userId");
    if (!userId) {
      userId = String(generateNumericId());
      localStorage.setItem("userId", userId);
    }

    localStorage.setItem("userName", userName.trim());
    localStorage.setItem("roomName", roomName.trim());
    localStorage.setItem("roomType", roomType);
    localStorage.setItem("roomPrivacy", privacy);
    localStorage.setItem("isHost", "true");

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          roomName: roomName.trim(),
          roomType,
          privacy,
          hostId: userId,
        }),
      });

      if (!res.ok) throw new Error();

      // Cinematic portal reveal before the actual navigation.
      setIsTransitioning(true);
      setTimeout(() => {
        router.push(roomType === "music" ? `/room/${roomId}` : `/ktv/${roomId}`);
      }, 620);
    } catch {
      setError("Không kết nối được máy chủ. Thử lại.");
      setIsLoading(false);
    }
  };

  return (
    <main
      onMouseMove={handlePointerMove}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08080A] px-4 py-8 font-[SF_Pro_Display,SF_Pro_Text,-apple-system,BlinkMacSystemFont,Inter,sans-serif] text-white sm:px-6"
    >
      {/* ---------------------------------------------------------- */}
      {/* Breathing, pointer-reactive aurora background               */}
      {/* ---------------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div style={{ x: aurora1X, y: aurora1Y }} className="absolute -left-40 -top-48 h-[560px] w-[560px]">
          <div className="animate-aurora-1 h-full w-full rounded-full bg-[radial-gradient(circle,rgba(255,45,146,0.55),transparent_70%)] blur-[120px]" />
        </motion.div>
        <motion.div style={{ x: aurora2X, y: aurora2Y }} className="absolute -right-40 -bottom-56 h-[600px] w-[600px]">
          <div className="animate-aurora-2 h-full w-full rounded-full bg-[radial-gradient(circle,rgba(133,58,255,0.5),transparent_70%)] blur-[120px]" />
        </motion.div>
        <motion.div style={{ x: aurora3X, y: aurora3Y }} className="absolute right-[8%] top-[28%] h-[440px] w-[440px]">
          <div className="animate-aurora-3 h-full w-full rounded-full bg-[radial-gradient(circle,rgba(250,36,60,0.35),transparent_70%)] blur-[120px]" />
        </motion.div>

        {/* Drifting ambient particles */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="particle absolute bottom-0 rounded-full bg-white/40"
            style={{
              left: `${p.left}%`,
              width: p.note ? "auto" : `${p.size}px`,
              height: p.note ? "auto" : `${p.size}px`,
              fontSize: p.note ? `${p.size + 6}px` : undefined,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              color: "rgba(255,255,255,0.35)",
              background: p.note ? "transparent" : undefined,
            }}
          >
            {p.note ? "♪" : ""}
          </span>
        ))}
      </div>

      {/* Subtle film-grain texture for a premium finish */}
      <div className="grain pointer-events-none absolute inset-0 z-40 opacity-[0.035]" />

      <div className="relative z-10 mx-auto w-full max-w-5xl">
        {/* ---------------------------------------------------------- */}
        {/* Top navbar                                                  */}
        {/* ---------------------------------------------------------- */}
        <motion.header
          variants={navVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 flex items-center gap-3"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-lg">
            🎵
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff375f]">Music Room</p>
            <p className="text-sm text-white/50">Tạo không gian nghe nhạc riêng của bạn</p>
          </div>

          {/* Little equalizer accent, ticking like a live meter */}
          <div className="ml-auto flex h-6 items-end gap-[3px]" aria-hidden="true">
            <span className="eq-bar eq-1" />
            <span className="eq-bar eq-2" />
            <span className="eq-bar eq-3" />
            <span className="eq-bar eq-4" />
          </div>
        </motion.header>

        {/* ---------------------------------------------------------- */}
        {/* Two-column bento layout                                     */}
        {/* ---------------------------------------------------------- */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]"
        >
          {/* ---------------- LEFT: form panel ---------------- */}
          <SpotlightPanel variants={panelVariants} className="p-7 sm:p-9">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#ff375f]">Tạo phòng mới</p>
            <AnimatedHeading text="Bắt đầu không gian của bạn" />

            <Field label="Tên của bạn">
              <Input
                value={userName}
                onChange={(v) => {
                  setUserName(v);
                  setError("");
                }}
                placeholder="Nhập tên của bạn..."
                icon="user"
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
                icon="headphones"
              />
            </Field>

            <Field label="Loại phòng">
              <Segmented
                groupId="room-type"
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
                groupId="privacy"
                value={privacy}
                onChange={(v) => setPrivacy(v as RoomPrivacy)}
                options={[
                  { id: "public", label: "Công khai" },
                  { id: "private", label: "Riêng tư" },
                ]}
              />
            </Field>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-1 text-sm text-[#ff6b81]"
                >
                  ⚠ {error}
                </motion.p>
              )}
            </AnimatePresence>
          </SpotlightPanel>

          {/* ---------------- RIGHT: room summary card ---------------- */}
          <SpotlightPanel variants={panelVariants} className="p-7 sm:p-8">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-[#fa243c]/25 blur-[80px]" />

            <div className="relative text-center">
              <h2 className="text-lg font-bold">Thông tin phòng</h2>
            </div>

            <div className="relative mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">Mã phòng</p>
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="w-full bg-transparent text-center text-2xl font-extrabold tracking-wide text-white outline-none"
              />
              <p className="mt-2 truncate text-xs text-white/40">{getRoomUrl()}</p>

              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={copyLink}
                className="mt-4 h-9 w-full rounded-full border border-white/10 bg-white/[0.08] text-xs font-semibold text-white transition-colors hover:bg-white/[0.14]"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copied ? "copied" : "copy"}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="inline-block"
                  >
                    {copied ? "Đã sao chép ✓" : "Sao chép liên kết"}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>

            <AnimatePresence>
              {roomId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
                  className="relative mt-5 flex justify-center"
                >
                  <div className="qr-glow rounded-2xl bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getQRUrl()} alt="QR code" className="h-[132px] w-[132px] rounded-xl" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={createRoom}
              disabled={isLoading}
              className="submit-glow relative mt-6 h-14 w-full overflow-hidden rounded-2xl bg-[#fa243c] text-base font-bold tracking-tight text-white shadow-[0_18px_40px_rgba(250,36,60,0.32)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Đang tạo..." : "Tạo phòng"}
            </motion.button>

            <button
              onClick={() => router.back()}
              disabled={isLoading}
              className="relative mt-3 h-10 w-full text-sm text-white/45 transition-colors hover:text-white"
            >
              Quay lại
            </button>
          </SpotlightPanel>
        </motion.section>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Cinematic portal transition on room entry                   */}
      {/* ---------------------------------------------------------- */}
      <AnimatePresence>
        {isTransitioning && (
          <motion.div
            initial={{ clipPath: "circle(0% at 50% 100%)" }}
            animate={{ clipPath: "circle(150% at 50% 100%)" }}
            transition={{ duration: 0.62, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#fa243c] via-[#c81f38] to-[#08080A]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.28, duration: 0.3 }}
              className="text-center"
            >
              <div className="mb-4 text-5xl">🎧</div>
              <p className="text-lg font-semibold tracking-tight">Đang vào phòng...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------- */}
      {/* Global keyframes                                             */}
      {/* (Consider moving these into tailwind.config.js theme.extend  */}
      {/*  if you want animation config centralized.)                  */}
      {/* ---------------------------------------------------------- */}
      <style jsx global>{`
        @keyframes auroraMove1 {
          0%, 100% { transform: rotate(0deg) scale(1); }
          33% { transform: rotate(10deg) scale(1.08); }
          66% { transform: rotate(-8deg) scale(0.96); }
        }
        @keyframes auroraMove2 {
          0%, 100% { transform: rotate(0deg) scale(1); }
          33% { transform: rotate(-12deg) scale(1.05); }
          66% { transform: rotate(8deg) scale(0.94); }
        }
        @keyframes auroraMove3 {
          0%, 100% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(14deg) scale(1.12); }
        }
        .animate-aurora-1 { animation: auroraMove1 26s ease-in-out infinite; }
        .animate-aurora-2 { animation: auroraMove2 30s ease-in-out infinite; }
        .animate-aurora-3 { animation: auroraMove3 22s ease-in-out infinite; }

        @keyframes floatUp {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
        }
        .particle { animation-name: floatUp; animation-timing-function: linear; animation-iteration-count: infinite; }

        @keyframes eqBounce {
          0%, 100% { height: 4px; }
          50% { height: 18px; }
        }
        .eq-bar { width: 3px; border-radius: 2px; background: #e9e5e6; animation: eqBounce 1.1s ease-in-out infinite; }
        .eq-1 { animation-duration: 0.9s; }
        .eq-2 { animation-duration: 1.2s; animation-delay: 0.1s; }
        .eq-3 { animation-duration: 0.8s; animation-delay: 0.2s; }
        .eq-4 { animation-duration: 1.05s; animation-delay: 0.05s; }

        .spotlight-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(320px circle at var(--spot-x) var(--spot-y), rgba(255,255,255,0.07), transparent 65%);
          opacity: 0;
          transition: opacity 0.35s ease;
          pointer-events: none;
        }
        .spotlight-panel:hover::before { opacity: 1; }

        .qr-glow { box-shadow: 0 0 0 rgba(250,36,60,0.35); animation: qrPulse 2.6s ease-in-out infinite; }
        @keyframes qrPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(250,36,60,0.28); }
          50% { box-shadow: 0 0 28px rgba(250,36,60,0.28); }
        }

        .submit-glow::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.25), transparent);
          transform: translateX(-120%);
        }
        .submit-glow:hover::after { animation: shine 1.1s ease forwards; }
        @keyframes shine {
          to { transform: translateX(120%); }
        }

        .grain {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          mix-blend-mode: overlay;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-aurora-1, .animate-aurora-2, .animate-aurora-3, .particle, .eq-bar, .qr-glow, .submit-glow::after {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Field                                                               */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                               */
/* ------------------------------------------------------------------ */

function UserIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c1.6-4 5-6 8-6s6.4 2 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function HeadphonesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="2.5" y="13" width="5" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.5" y="13" width="5" height="7" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Input                                                               */
/* ------------------------------------------------------------------ */

function Input({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: "user" | "headphones";
}) {
  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-4 text-white/35">
        {icon === "user" ? <UserIcon /> : <HeadphonesIcon />}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-[52px] w-full rounded-2xl border border-white/10 bg-white/[0.06] pl-11 pr-4 text-[15px] text-white outline-none backdrop-blur-md transition-colors duration-200 placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.09]"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Segmented control with sliding pill (framer-motion layoutId)       */
/* ------------------------------------------------------------------ */

function Segmented({
  groupId,
  options,
  value,
  onChange,
}: {
  groupId: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex h-12 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative flex-1 rounded-xl text-sm font-semibold transition-colors duration-200 ${
              active ? "text-white" : "text-white/50 hover:text-white/75"
            }`}
          >
            {active && (
              <motion.div
                layoutId={`pill-${groupId}`}
                className="absolute inset-0 -z-10 rounded-xl bg-white/15"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}