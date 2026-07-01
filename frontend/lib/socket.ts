const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";

export interface SocketOptions {
  roomId: string;
  userId: string;
  userName: string;
  roomType?: "music" | "ktv";
  privacy?: "public" | "private";
}

const DEFAULT_WS =
  typeof window !== "undefined"
    ? `${
        window.location.protocol === "https:" ? "wss" : "ws"
      }://${window.location.host}`
    : "ws://localhost:3000";

export function createSocket(
  roomIdOrOptions: string | SocketOptions,
  userId?: string,
  userName?: string
): WebSocket {
  let opts: SocketOptions;

  // Hỗ trợ:
  // createSocket(roomId, userId, userName)
  // createSocket({ roomId, userId, userName, ... })

  if (typeof roomIdOrOptions === "string") {
    opts = {
      roomId: roomIdOrOptions,
      userId: userId ?? "",
      userName: userName ?? "Khách",
      roomType: "music",
      privacy: "public",
    };
  } else {
    opts = {
      roomType: "music",
      privacy: "public",
      ...roomIdOrOptions,
    };
  }

  const base = (WS_URL || DEFAULT_WS).replace(/\/$/, "");

  const params = new URLSearchParams({
    roomId: opts.roomId,
    userId: opts.userId,
    userName: opts.userName || "Khách",
    roomType: opts.roomType ?? "music",
    privacy: opts.privacy ?? "public",
  });

  return new WebSocket(
    `${base}/ws?${params.toString()}`
  );
}