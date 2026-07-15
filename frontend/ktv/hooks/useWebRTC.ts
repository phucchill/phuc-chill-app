// ktv/hooks/useWebRTC.ts
// WebRTC mesh cho tối đa 6 ghế mic (≤15 cặp peer connection).
// Server chỉ relay SDP/ICE qua WEBRTC_OFFER / WEBRTC_ANSWER / WEBRTC_ICE_CANDIDATE
// (xem ktv_handler.go → handleWebRTCSignal). Media đi thẳng P2P giữa các client.
//
// FIX QUAN TRỌNG (so với bản trước): đã đổi sang "Perfect Negotiation
// Pattern" (khuyến nghị chính thức của WebRTC spec, xem
// https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation).
// Bản cũ chỉ gán `pc.onnegotiationneeded` cho bên "offerer" NGAY LÚC TẠO
// peer connection — lúc đó thường chưa ai bật camera (peer connection được
// tạo dựa theo việc ai đang giữ mic, không phải ai bật cam). Khi 1 bên bật
// camera SAU ĐÓ và gọi addTrack, nếu bên đó là "answerer" (không phải
// offerer ban đầu) thì renegotiation KHÔNG BAO GIỜ được kích hoạt — track
// mới không bao giờ tới được bên kia. Bug này tùy thuộc so sánh chuỗi
// userId nên xảy ra ngẫu nhiên ~50%.
// → Giờ CẢ 2 BÊN đều lắng nghe onnegotiationneeded, dùng cờ "polite" để xử
// lý va chạm (glare) khi cả 2 cùng gửi offer.
//
// FIX KHÁC: đổi getUserMedia audio:false → audio:true để giọng nói/giọng
// hát qua camera được truyền cùng video (trước đây chỉ truyền hình, không
// có tiếng).

import { useCallback, useEffect, useRef, useState } from "react";
import type { WebRTCSignalPayload } from "@/types/websocket";

// STUN công cộng của Google — đủ dùng cho hầu hết mạng NAT thông thường.
// Nếu người dùng ở mạng NAT đối xứng (symmetric NAT, hay gặp ở mạng doanh
// nghiệp/mobile 4G một số nhà mạng) sẽ cần thêm TURN server mới kết nối được.
// Gợi ý free-tier khi cần: openrelay.metered.ca (giới hạn băng thông) hoặc
// tự host coturn. Thêm vào mảng iceServers bên dưới khi có.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface UseWebRTCParams {
  myUserId: string;
  /** Danh sách userId hiện đang giữ 1 trong 6 ghế mic (không tính chính mình) — hook tự tạo/dọn peer connection khi danh sách này đổi. */
  peerUserIds: string[];
  /** true nếu chính mình đang giữ mic + đã bật camera → publish local stream. */
  cameraOn: boolean;
  sendSignal: (type: "WEBRTC_OFFER" | "WEBRTC_ANSWER" | "WEBRTC_ICE_CANDIDATE", payload: WebRTCSignalPayload) => void;
}

interface RemoteStreamEntry {
  userId: string;
  stream: MediaStream;
}

// Cờ trạng thái riêng cho từng peer connection — cần cho Perfect Negotiation.
interface PeerFlags {
  polite: boolean; // bên "lịch sự" sẽ rollback offer của chính mình khi va chạm, thay vì bỏ qua offer đến
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export function useWebRTC({ myUserId, peerUserIds, cameraOn, sendSignal }: UseWebRTCParams) {
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const flagsRef = useRef<Map<string, PeerFlags>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;

  // ── Bật/tắt camera local ──
  useEffect(() => {
    let cancelled = false;

    if (cameraOn) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 640, height: 640, facingMode: "user" }, audio: true })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setLocalStream(stream);
          setCameraError(null);
          // Gắn track vào các peer connection đã mở sẵn (nếu bật camera sau
          // khi đã có peer) — addTrack sẽ tự kích hoạt onnegotiationneeded
          // trên CHÍNH peer connection này (đúng chuẩn WebRTC), và giờ cả 2
          // bên đều lắng nghe sự kiện đó nên renegotiation luôn xảy ra.
          pcsRef.current.forEach((pc) => {
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          });
        })
        .catch((err) => {
          if (!cancelled) setCameraError(err?.message || "Không thể truy cập camera/micro");
        });
    } else {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    return () => {
      cancelled = true;
    };
  }, [cameraOn]);

  const createPeerConnection = useCallback(
    (peerUserId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // "polite" quyết định ai nhường khi va chạm offer — dùng đúng quy ước
      // cũ (myUserId < peerUserId → impolite/aggressive) để nhất quán,
      // nhưng giờ CẢ 2 BÊN đều có thể chủ động gửi offer khi cần renegotiate.
      const flags: PeerFlags = { polite: myUserId > peerUserId, makingOffer: false, ignoreOffer: false };
      flagsRef.current.set(peerUserId, flags);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.ontrack = (ev) => {
        setRemoteStreams((prev) => {
          const others = prev.filter((r) => r.userId !== peerUserId);
          return [...others, { userId: peerUserId, stream: ev.streams[0] }];
        });
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignalRef.current("WEBRTC_ICE_CANDIDATE", {
            targetUserId: peerUserId,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          pcsRef.current.delete(peerUserId);
          flagsRef.current.delete(peerUserId);
          setRemoteStreams((prev) => prev.filter((r) => r.userId !== peerUserId));
        }
      };

      // Perfect Negotiation: CẢ 2 bên đều lắng nghe negotiationneeded (khác
      // bản cũ chỉ gán cho 1 bên "offerer" cố định). Sự kiện này tự kích
      // hoạt bất cứ khi nào addTrack/removeTrack được gọi trên CHÍNH pc này
      // — kể cả khi bật camera muộn sau khi peer connection đã tồn tại.
      pc.onnegotiationneeded = async () => {
        try {
          flags.makingOffer = true;
          const offer = await pc.createOffer();
          // Nếu đã có renegotiation khác đang diễn ra / state đổi giữa
          // chừng thì bỏ qua, tránh setLocalDescription trên state sai.
          if (pc.signalingState !== "stable" && pc.signalingState !== "have-local-offer") {
            return;
          }
          await pc.setLocalDescription(offer);
          sendSignalRef.current("WEBRTC_OFFER", { targetUserId: peerUserId, sdp: pc.localDescription! });
        } catch {
          // bỏ qua — nếu thật sự cần thiết, lần negotiationneeded kế tiếp sẽ thử lại
        } finally {
          flags.makingOffer = false;
        }
      };

      pcsRef.current.set(peerUserId, pc);
      return pc;
    },
    [myUserId]
  );

  // ── Tự tạo peer connection khi có ghế mic mới, tự dọn khi ghế rời đi ──
  useEffect(() => {
    const current = new Set(pcsRef.current.keys());
    const wanted = new Set(peerUserIds);

    for (const peerId of peerUserIds) {
      if (!current.has(peerId)) {
        createPeerConnection(peerId);
      }
    }

    for (const peerId of current) {
      if (!wanted.has(peerId)) {
        pcsRef.current.get(peerId)?.close();
        pcsRef.current.delete(peerId);
        flagsRef.current.delete(peerId);
        setRemoteStreams((prev) => prev.filter((r) => r.userId !== peerId));
      }
    }
  }, [peerUserIds, createPeerConnection]);

  // ── Nhận signal từ server (gọi hàm này trong message handler chính của page.tsx) ──
  const handleSignal = useCallback(
    async (type: "WEBRTC_OFFER" | "WEBRTC_ANSWER" | "WEBRTC_ICE_CANDIDATE", payload: WebRTCSignalPayload) => {
      const fromUserId = payload.fromUserId;
      if (!fromUserId) return;

      let pc = pcsRef.current.get(fromUserId);
      if (!pc) {
        pc = createPeerConnection(fromUserId);
      }
      const flags = flagsRef.current.get(fromUserId)!;

      try {
        if (type === "WEBRTC_OFFER" && payload.sdp) {
          // Xử lý va chạm: nếu mình cũng đang tạo offer (hoặc signaling
          // state không "stable") tại đúng lúc nhận offer từ bên kia →
          // bên "impolite" bỏ qua offer đến để giữ offer của mình; bên
          // "polite" rollback offer của mình rồi nhận offer đến.
          const offerCollision = flags.makingOffer || pc.signalingState !== "stable";
          flags.ignoreOffer = !flags.polite && offerCollision;
          if (flags.ignoreOffer) return;

          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }),
              pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignalRef.current("WEBRTC_ANSWER", { targetUserId: fromUserId, sdp: answer });
        } else if (type === "WEBRTC_ANSWER" && payload.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } else if (type === "WEBRTC_ICE_CANDIDATE" && payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (err) {
            // Bỏ qua nếu candidate tới trong lúc đang ignore offer (bình
            // thường trong quy trình va chạm) — chỉ đây là trường hợp nên
            // im lặng, các lỗi ICE khác vẫn có thể tự phục hồi qua ICE restart.
            if (!flags.ignoreOffer) throw err;
          }
        }
      } catch {
        // bỏ qua lỗi ICE/SDP lẻ tẻ khác — kết nối sẽ tự phục hồi hoặc rơi
        // vào "failed" và bị dọn bởi onconnectionstatechange
      }
    },
    [createPeerConnection]
  );

  // ── Dọn toàn bộ khi rời phòng ──
  useEffect(() => {
    return () => {
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      flagsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { localStream, remoteStreams, cameraError, handleSignal };
}