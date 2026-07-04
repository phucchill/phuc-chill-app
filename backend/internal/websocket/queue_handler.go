package websocket

import (
	"encoding/json"
	"fmt"
	"time"
)

// queueMessageTypes là các message liên quan tới "Danh sách chờ" bài hát
// của Music Room (khác với SONG_QUEUE_ADD/REMOVE/NEXT của chế độ KTV).
// PLAYER_NEXT/PLAYER_PREV cũng nằm ở đây vì chúng thao tác trực tiếp lên
// cùng QueueState (pop bài kế tiếp / đẩy lịch sử) — tách riêng file khác
// sẽ phải lock/unlock lặp lại không cần thiết.
var queueMessageTypes = map[string]bool{
	"QUEUE_REQUEST":       true,
	"QUEUE_APPROVE":       true,
	"QUEUE_REJECT":        true,
	"QUEUE_REMOVE":        true,
	"QUEUE_CLEAR_PENDING": true,
	"PLAYER_NEXT":         true,
	"PLAYER_PREV":         true,
}

func IsQueueMessage(t string) bool {
	return queueMessageTypes[t]
}

const requestCooldown = 20 * time.Second

type queueSongPayload struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Artist    string  `json:"artist"`
	Thumbnail string  `json:"thumbnail"`
	Duration  float64 `json:"duration"`
	SongUrl   string  `json:"songSrc"`
}

type queueIDPayload struct {
	ID string `json:"id"`
}

// handleQueueMessage xử lý toàn bộ message của "Danh sách chờ" + điều
// khiển Next/Prev của Music Room. Được gọi từ handleBroadcast SAU KHI hub
// đã unlock, nên hàm này tự lock/unlock h.mu của riêng nó.
func (h *Hub) handleQueueMessage(room *Room, msg Message) {
	h.mu.Lock()

	if room.Queue == nil {
		room.Queue = &QueueState{}
	}
	if room.LastRequestAt == nil {
		room.LastRequestAt = make(map[string]time.Time)
	}

	isHost := room.isHost(msg.SenderID)
	changed := true
	broadcastState := true // false cho các case chỉ gửi thông báo riêng, không đổi ROOM_STATE

	switch msg.Type {
	case "QUEUE_REQUEST":
		// Chống spam: 20s/lần cho MỖI user (kể cả host), tính từ lần
		// request gần nhất — không phân biệt request có được duyệt hay bị
		// từ chối.
		if last, ok := room.LastRequestAt[msg.SenderID]; ok {
			elapsed := time.Since(last)
			if elapsed < requestCooldown {
				remaining := requestCooldown - elapsed
				h.sendErrorLocked(room, msg.SenderID, fmt.Sprintf(
					"Vui lòng đợi %d giây nữa trước khi gửi yêu cầu tiếp theo",
					int(remaining.Seconds())+1,
				))
				changed = false
				break
			}
		}

		var p queueSongPayload
		if json.Unmarshal(msg.Payload, &p) != nil || p.Title == "" || p.ID == "" {
			changed = false
			break
		}

		// Không cho thêm bài đang phát (so khớp bằng file mp3 thật, không
		// phải ID request — vì mỗi lần request FE tạo ID ngẫu nhiên mới).
		if p.SongUrl != "" && p.SongUrl == room.CurrentSong {
			h.sendErrorLocked(room, msg.SenderID, "Bài này đang được phát rồi")
			changed = false
			break
		}

		room.LastRequestAt[msg.SenderID] = time.Now()

		song := QueueSong{
			ID:          p.ID,
			Title:       p.Title,
			Artist:      p.Artist,
			Thumbnail:   p.Thumbnail,
			Duration:    p.Duration,
			SongUrl:     p.SongUrl,
			RequestedBy: msg.SenderID,
		}

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

		// Lấy thông tin bài TRƯỚC khi xóa, để biết gửi thông báo cho ai.
		song, found := room.Queue.FindByID(p.ID)
		changed = room.Queue.Reject(p.ID)

		if changed && found && song.RequestedBy != "" && song.RequestedBy != msg.SenderID {
			h.sendToUserLocked(room, song.RequestedBy, "QUEUE_REJECTED", map[string]string{
				"id":      song.ID,
				"title":   song.Title,
				"message": fmt.Sprintf("Host đã từ chối bài \"%s\" của bạn", song.Title),
			})
		}

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

		song, found := room.Queue.FindByID(p.ID)
		changed = room.Queue.Remove(p.ID)

		if changed && found && song.RequestedBy != "" && song.RequestedBy != msg.SenderID {
			h.sendToUserLocked(room, song.RequestedBy, "QUEUE_REMOVED", map[string]string{
				"id":      song.ID,
				"title":   song.Title,
				"message": fmt.Sprintf("Host đã xóa bài \"%s\" của bạn khỏi hàng chờ", song.Title),
			})
		}

	case "QUEUE_CLEAR_PENDING":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được xóa hết yêu cầu chờ duyệt")
			changed = false
			break
		}

		room.Queue.ClearPending()

	case "PLAYER_NEXT":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được chuyển bài")
			changed = false
			break
		}

		next, ok := room.Queue.PopNextQueued()
		if !ok {
			h.sendErrorLocked(room, msg.SenderID, "Không còn bài nào trong hàng chờ")
			changed = false
			break
		}

		// Bài đang phát (nếu có) được đẩy vào lịch sử để Prev dùng lại.
		if room.CurrentQueueSong != nil {
			room.Queue.PushHistory(*room.CurrentQueueSong)
		}

		room.CurrentSong = next.SongUrl
		room.CurrentQueueSong = &next
		room.IsPlaying = true
		room.Progress = 0
		room.LastUpdated = time.Now()

	case "PLAYER_PREV":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được chuyển bài")
			changed = false
			break
		}

		prev, ok := room.Queue.PopHistory()
		if !ok {
			h.sendErrorLocked(room, msg.SenderID, "Không có bài trước đó")
			changed = false
			break
		}

		// Bài đang phát (nếu có) quay lại ĐẦU hàng chờ để có thể Next tới
		// lại đúng bài đó.
		if room.CurrentQueueSong != nil {
			room.Queue.PushFrontQueued(*room.CurrentQueueSong)
		}

		room.CurrentSong = prev.SongUrl
		room.CurrentQueueSong = &prev
		room.IsPlaying = true
		room.Progress = 0
		room.LastUpdated = time.Now()

	default:
		changed = false
		broadcastState = false
	}

	h.mu.Unlock()

	if !changed || !broadcastState {
		return
	}

	h.broadcastRoomState(room.ID)
}