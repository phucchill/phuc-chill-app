const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

export interface SocketOptions {
  roomId: string;
  userId: string;
  userName: string;
  roomType?: "music" | "ktv";
  privacy?: "public" | "private";
}

export function createSocket(
  roomIdOrOptions: string | SocketOptions,
  userId?: string,
  userName?: string
): WebSocket {
  let opts: SocketOptions;

  // Hỗ trợ cả 2 cách gọi:
  // createSocket(roomId, userId, userName)           ← cách cũ, không break
  // createSocket({ roomId, userId, userName, ... })  ← cách mới cho KTV
  if (typeof roomIdOrOptions === "string") {
    opts = {
      roomId:   roomIdOrOptions,
      userId:   userId ?? "",
      userName: userName ?? "Khách",
      roomType: "music",
      privacy:  "public",
    };
  } else {
    opts = {
      roomType: "music",
      privacy:  "public",
      ...roomIdOrOptions,
    };
  }

  const base = WS_URL.replace(/\/$/, "");
  const params = new URLSearchParams({
    roomId:   opts.roomId,
    userId:   opts.userId,
    userName: opts.userName || "Khách",
    roomType: opts.roomType ?? "music",
    privacy:  opts.privacy  ?? "public",
  });

  return new WebSocket(`${base}/ws?${params.toString()}`);
}