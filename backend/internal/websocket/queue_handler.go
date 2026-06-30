package websocket

import "encoding/json"

// queueMessageTypes là các message liên quan tới "Danh sách chờ" bài hát
// của Music Room (khác với SONG_QUEUE_ADD/REMOVE/NEXT của chế độ KTV).
//
// Lưu ý: các type host-only ở đây KHÔNG nằm trong map hostOnlyMessages của
// hub.go, vì handleBroadcast sẽ delegate toàn bộ message khớp IsQueueMessage
// sang handleQueueMessage TRƯỚC khi chạy tới đoạn check hostOnlyMessages
// (giống cách KTV đang làm) — nên quyền hạn được kiểm tra ngay bên trong
// handleQueueMessage.
var queueMessageTypes = map[string]bool{
	"QUEUE_REQUEST":       true, // ai cũng gửi được — server tự quyết định pending/queued dựa vào isHost
	"QUEUE_APPROVE":       true, // chỉ host
	"QUEUE_REJECT":        true, // chỉ host
	"QUEUE_REMOVE":        true, // chỉ host
	"QUEUE_CLEAR_PENDING": true, // chỉ host
}

func IsQueueMessage(t string) bool {
	return queueMessageTypes[t]
}

type queueSongPayload struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Artist    string  `json:"artist"`
	Thumbnail string  `json:"thumbnail"`
	Duration  float64 `json:"duration"`
}

type queueIDPayload struct {
	ID string `json:"id"`
}

// handleQueueMessage xử lý toàn bộ message của "Danh sách chờ" Music Room.
// Được gọi từ handleBroadcast SAU KHI hub đã unlock (đúng pattern delegate
// của handleKTVMessage), nên hàm này tự lock/unlock h.mu của riêng nó.
func (h *Hub) handleQueueMessage(room *Room, msg Message) {
	h.mu.Lock()

	if room.Queue == nil {
		room.Queue = &QueueState{}
	}

	isHost := room.isHost(msg.SenderID)
	changed := true

	switch msg.Type {
	case "QUEUE_REQUEST":
		var p queueSongPayload
		if json.Unmarshal(msg.Payload, &p) != nil || p.Title == "" || p.ID == "" {
			changed = false
			break
		}

		song := QueueSong{
			ID:          p.ID,
			Title:       p.Title,
			Artist:      p.Artist,
			Thumbnail:   p.Thumbnail,
			Duration:    p.Duration,
			RequestedBy: msg.SenderID,
		}

		// Host tự thêm bài thì vào thẳng "queued", khỏi cần duyệt.
		// Thành viên khác request thì vào "pending", chờ host duyệt.
		if isHost {
			room.Queue.AddQueued(song)
		} else {
			room.Queue.AddPending(song)
		}

	case "QUEUE_APPROVE":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được duyệt bài hát")
			changed = false
			break
		}

		var p queueIDPayload
		if json.Unmarshal(msg.Payload, &p) != nil || p.ID == "" {
			changed = false
			break
		}

		changed = room.Queue.Approve(p.ID)

	case "QUEUE_REJECT":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được từ chối bài hát")
			changed = false
			break
		}

		var p queueIDPayload
		if json.Unmarshal(msg.Payload, &p) != nil || p.ID == "" {
			changed = false
			break
		}

		changed = room.Queue.Reject(p.ID)

	case "QUEUE_REMOVE":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được xóa bài hát khỏi hàng chờ")
			changed = false
			break
		}

		var p queueIDPayload
		if json.Unmarshal(msg.Payload, &p) != nil || p.ID == "" {
			changed = false
			break
		}

		changed = room.Queue.Remove(p.ID)

	case "QUEUE_CLEAR_PENDING":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được xóa hết yêu cầu chờ duyệt")
			changed = false
			break
		}

		room.Queue.ClearPending()

	default:
		changed = false
	}

	h.mu.Unlock()

	if !changed {
		return
	}

	// Mọi thay đổi hàng chờ đều broadcast lại ROOM_STATE (đã gồm queueSongs)
	// cho cả phòng để UI luôn đồng bộ — giống cách JOIN_APPROVE/JOIN_REJECT
	// đang làm với participants.
	h.broadcastRoomState(room.ID)
}