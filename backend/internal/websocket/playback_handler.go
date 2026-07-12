package websocket

import "encoding/json"

// playbackMessageTypes là các message điều khiển CÁCH PHÁT nhạc (không phải
// CRUD hàng chờ như queue_handler.go): bật/tắt Shuffle, đổi chế độ Repeat,
// và Like bài đang phát. Tách riêng file này để queue_handler.go không
// phình to và giữ đúng trách nhiệm của từng file.
var playbackMessageTypes = map[string]bool{
	"SHUFFLE_TOGGLE":     true,
	"REPEAT_MODE_UPDATE": true,
	"SONG_LIKE_TOGGLE":   true,
}

func IsPlaybackMessage(t string) bool {
	return playbackMessageTypes[t]
}

type repeatModePayload struct {
	Mode string `json:"mode"` // "off" | "one" | "all"
}

func isValidRepeatMode(mode string) bool {
	return mode == "off" || mode == "one" || mode == "all"
}

// handlePlaybackMessage xử lý SHUFFLE_TOGGLE/REPEAT_MODE_UPDATE/
// SONG_LIKE_TOGGLE. Được gọi từ handleBroadcast SAU KHI hub đã unlock,
// hàm này tự lock/unlock h.mu của riêng nó — giống hệt pattern của
// handleQueueMessage/handleKTVMessage.
//
// LƯU Ý QUYỀN: Shuffle/Repeat CHỈ host được đổi (ảnh hưởng tới cả phòng).
// Like thì AI CŨNG bấm được — đây là hành động mang tính cá nhân/vui vẻ,
// không cần quyền host, tương tự việc gửi chat.
func (h *Hub) handlePlaybackMessage(room *Room, msg Message) {
	h.mu.Lock()

	isHost := room.isHost(msg.SenderID)
	changed := true

	switch msg.Type {
	case "SHUFFLE_TOGGLE":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được bật/tắt phát ngẫu nhiên")
			changed = false
			break
		}
		room.ShuffleEnabled = !room.ShuffleEnabled

	case "REPEAT_MODE_UPDATE":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được đổi chế độ lặp lại")
			changed = false
			break
		}

		var p repeatModePayload
		if json.Unmarshal(msg.Payload, &p) != nil || !isValidRepeatMode(p.Mode) {
			changed = false
			break
		}
		room.RepeatMode = p.Mode

	case "SONG_LIKE_TOGGLE":
		// Like áp dụng cho BÀI ĐANG PHÁT, dùng chung cho cả phòng (chưa có
		// hệ thống thư viện/like riêng từng người dùng — xem ghi chú ở
		// RoomState.CurrentSongLiked trong hub.go). Không cho like khi
		// chưa có bài nào đang phát.
		if room.CurrentSong == "" {
			changed = false
			break
		}
		room.CurrentSongLiked = !room.CurrentSongLiked

	default:
		changed = false
	}

	h.mu.Unlock()

	if !changed {
		return
	}

	h.broadcastRoomState(room.ID)
}