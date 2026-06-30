import { useState, useEffect, useRef, useCallback } from "react";
import { ChatMessage, msgKey } from "../types/websocket";

interface UseChatHistoryOptions {
  roomId: string;
  currentUserId: string;
  apiBase?: string;
}

interface UseChatHistoryReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  // isMine phải được caller tính sẵn trước khi truyền vào
  appendMessage: (msg: ChatMessage) => void;
}

export function useChatHistory({
  roomId,
  currentUserId,
  apiBase = "",
}: UseChatHistoryOptions): UseChatHistoryReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const seenKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    // ✅ chờ userId có rồi mới fetch
    if (!roomId || !currentUserId) return;

    setIsLoading(true);
    seenKeys.current.clear();
    setMessages([]);

    fetch(`${apiBase}/rooms/${roomId}/messages`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((history: ChatMessage[]) => {
        const normalized = (history ?? []).map((m) => {   // ← thêm `?? []`
          const senderId = m.senderId ?? (m as any).userId ?? "";
          return {
            ...m,
            id: m._id ?? m.id,
            senderId,
            // ✅ tính isMine dựa trên currentUserId tại thời điểm fetch (đã có giá trị)
            isMine: senderId === currentUserId,
          };
        });

        normalized.forEach((m) => seenKeys.current.add(msgKey(m)));
        setMessages(normalized);
      })
      .catch((err) => {
        console.error("[useChatHistory] Lỗi load lịch sử:", err);
        setMessages([]);
      })
      .finally(() => setIsLoading(false));
  }, [roomId, currentUserId, apiBase]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    // ✅ isMine đã được page.tsx tính sẵn bằng userIdRef.current trước khi gọi
    // hook không tính lại, tránh stale closure
    const key = msgKey(msg);
    if (seenKeys.current.has(key)) return;
    seenKeys.current.add(key);
    setMessages((prev) => [...prev, msg]);
  }, []);

  return { messages, isLoading, appendMessage };
}