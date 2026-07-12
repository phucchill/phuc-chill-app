package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"music-room/internal/handlers"
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

	// Source: "library" | "upload" | "youtube". Rỗng được coi là "library"
	// để tương thích ngược với client cũ chưa gửi field này.
	Source string `json:"source"`
}

type queueIDPayload struct {
	ID string `json:"id"`
}

// findClientUserName tìm tên hiển thị của 1 user đang có mặt trong phòng.
// PHẢI được gọi trong lúc đang giữ h.mu (đọc room.Clients).
func findClientUserName(room *Room, userID string) string {
	for c := range room.Clients {
		if c.UserID == userID {
			return c.UserName
		}
	}
	return ""
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

		source := p.Source
		if source == "" {
			source = "library"
		}

		// Quyền thêm bài theo nguồn — chỉ áp dụng cho member, host luôn
		// được phép. Xem model.RoomPermissions.CanMemberAdd.
		if !isHost && !room.Permissions.CanMemberAdd(source) {
			var reason string
			switch source {
			case "upload":
				reason = "Host đã tắt quyền tải file lên cho thành viên"
			case "youtube":
				reason = "Host đã tắt quyền thêm link YouTube cho thành viên"
			default:
				reason = "Host đã tắt quyền tìm kiếm thư viện cho thành viên"
			}
			h.sendErrorLocked(room, msg.SenderID, reason)
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
			ID:              p.ID,
			Title:           p.Title,
			Artist:          p.Artist,
			Thumbnail:       p.Thumbnail,
			Duration:        p.Duration,
			SongUrl:         p.SongUrl,
			RequestedBy:     msg.SenderID,
			RequestedByName: findClientUserName(room, msg.SenderID),
			Source:          source,
		}

		// Auto-approve: host luôn auto-approve. Member chỉ auto-approve
		// nếu đây là file upload VÀ host đã bật "Auto approve uploads".
		autoApprove := isHost || (source == "upload" && room.Permissions.AutoApproveUploads)

		if autoApprove {
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

		if changed && found {
			// Bài bị từ chối chắc chắn không còn dùng lại — xóa file
			// upload NGAY, không cần chờ sweeper dọn theo tuổi.
			h.deleteUploadFileForSong(song)

			if song.RequestedBy != "" && song.RequestedBy != msg.SenderID {
				h.sendToUserLocked(room, song.RequestedBy, "QUEUE_REJECTED", map[string]string{
					"id":      song.ID,
					"title":   song.Title,
					"message": fmt.Sprintf("Host đã từ chối bài \"%s\" của bạn", song.Title),
				})
			}
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

		if changed && found {
			// Bài này chưa từng được phát (đang nằm trong hàng chờ, chưa
			// tới lượt) — xóa hẳn nghĩa là sẽ không bao giờ cần file này
			// nữa, xóa NGAY an toàn.
			h.deleteUploadFileForSong(song)

			if song.RequestedBy != "" && song.RequestedBy != msg.SenderID {
				h.sendToUserLocked(room, song.RequestedBy, "QUEUE_REMOVED", map[string]string{
					"id":      song.ID,
					"title":   song.Title,
					"message": fmt.Sprintf("Host đã xóa bài \"%s\" của bạn khỏi hàng chờ", song.Title),
				})
			}
		}

	case "QUEUE_CLEAR_PENDING":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được xóa hết yêu cầu chờ duyệt")
			changed = false
			break
		}

		// Xóa file upload cho TỪNG bài pending trước khi xóa khỏi hàng chờ
		// — pending nghĩa là chưa từng được duyệt/phát, xóa an toàn.
		for _, song := range room.Queue.Songs {
			if song.Status == "pending" {
				h.deleteUploadFileForSong(song)
			}
		}
		room.Queue.ClearPending()

	case "PLAYER_NEXT":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được chuyển bài")
			changed = false
			break
		}

		// Repeat "one": phát lại ĐÚNG bài đang phát, không đụng vào hàng
		// chờ/history — bấm Next trong lúc lặp 1 bài chỉ là restart.
		if room.RepeatMode == "one" && room.CurrentQueueSong != nil {
			room.Progress = 0
			room.IsPlaying = true
			room.LastUpdated = time.Now()
			room.CurrentSongLiked = false
			break
		}

		var next QueueSong
		var ok bool
		if room.ShuffleEnabled {
			// Shuffle: chọn ngẫu nhiên 1 bài "queued" — KHÔNG xáo trộn thứ
			// tự hiển thị của hàng chờ, chỉ đổi cách chọn bài kế tiếp.
			next, ok = room.Queue.PopRandomQueued()
		} else {
			next, ok = room.Queue.PopNextQueued()
		}

		if !ok {
			h.sendErrorLocked(room, msg.SenderID, "Không còn bài nào trong hàng chờ")
			changed = false
			break
		}

		if room.CurrentQueueSong != nil {
			if room.RepeatMode == "all" {
				// Repeat "all": bài vừa phát xong quay lại CUỐI hàng chờ
				// thay vì xóa hẳn → vòng lặp vô hạn qua toàn bộ queue.
				room.Queue.PushBackQueued(*room.CurrentQueueSong)
			} else {
				room.Queue.PushHistory(*room.CurrentQueueSong)
			}
		}

		room.CurrentSong = next.SongUrl
		room.CurrentQueueSong = &next
		room.IsPlaying = true
		room.Progress = 0
		room.LastUpdated = time.Now()
		room.CurrentSongLiked = false

	case "PLAYER_PREV":
		if !isHost {
			h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được chuyển bài")
			changed = false
			break
		}

		// Repeat "one": Prev cũng chỉ restart bài đang phát, giữ nguyên
		// hành vi nhất quán với Next khi đang lặp 1 bài.
		if room.RepeatMode == "one" && room.CurrentQueueSong != nil {
			room.Progress = 0
			room.IsPlaying = true
			room.LastUpdated = time.Now()
			room.CurrentSongLiked = false
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
		room.CurrentSongLiked = false

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

// deleteUploadFileForSong xóa file vật lý đứng sau 1 QueueSong nguồn
// "upload", nếu có. Không làm gì với bài "library"/"youtube". PHẢI được
// gọi trong lúc đang giữ h.mu (cùng ngữ cảnh lock với phần còn lại của
// handleQueueMessage) — bản thân os.Remove không cần lock nhưng gọi ở đây
// để giữ code gọn, không tách file riêng chỉ vì 1 hàm nhỏ.
func (h *Hub) deleteUploadFileForSong(song QueueSong) {
	if song.Source != "upload" || h.UploadDir == "" {
		return
	}

	fileName, ok := handlers.ExtractUploadFileName(h.UploadPublicPath, song.SongUrl)
	if !ok {
		return
	}

	if err := handlers.DeleteUploadedFile(h.UploadDir, fileName); err != nil {
		log.Printf("[Queue] Xóa file upload %s lỗi: %v", fileName, err)
	}
}