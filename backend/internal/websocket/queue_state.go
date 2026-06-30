package websocket

// QueueSong đại diện 1 bài hát trong "Danh sách chờ" của Music Room.
// Đây là tính năng riêng của Music Room, KHÔNG liên quan tới hàng chờ
// mic/bài hát của chế độ KTV (xem ktv_state.go, message SONG_QUEUE_*).
type QueueSong struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Artist      string  `json:"artist,omitempty"`
	Thumbnail   string  `json:"thumbnail,omitempty"`
	Duration    float64 `json:"duration,omitempty"`
	Status      string  `json:"status"` // "pending" | "queued"
	RequestedBy string  `json:"requestedBy,omitempty"`
}

// QueueState quản lý hàng chờ bài hát của 1 phòng. Giống KTVState, KHÔNG có
// mutex riêng — luôn được truy cập trong lúc Hub đang giữ h.mu (xem
// queue_handler.go), nên không cần lock thêm ở đây.
type QueueState struct {
	Songs []QueueSong
}

// List trả về danh sách bài hát hiện tại (không bao giờ trả về nil, để
// JSON trả ra luôn là [] thay vì null khi hàng chờ rỗng).
func (q *QueueState) List() []QueueSong {
	if q == nil || q.Songs == nil {
		return []QueueSong{}
	}
	return q.Songs
}

// AddQueued thêm 1 bài đã ở trạng thái "queued" — dùng khi HOST tự thêm,
// bỏ qua bước duyệt.
func (q *QueueState) AddQueued(song QueueSong) {
	song.Status = "queued"
	q.Songs = append(q.Songs, song)
}

// AddPending thêm 1 bài ở trạng thái "pending" — dùng khi THÀNH VIÊN
// (không phải host) request bài hát, cần host duyệt mới chuyển "queued".
func (q *QueueState) AddPending(song QueueSong) {
	song.Status = "pending"
	q.Songs = append(q.Songs, song)
}

// Approve chuyển 1 bài từ "pending" -> "queued".
// Trả về false nếu không tìm thấy bài đang "pending" với ID tương ứng.
func (q *QueueState) Approve(id string) bool {
	for i := range q.Songs {
		if q.Songs[i].ID == id && q.Songs[i].Status == "pending" {
			q.Songs[i].Status = "queued"
			return true
		}
	}
	return false
}

// Reject xóa 1 bài đang "pending" khỏi hàng chờ.
func (q *QueueState) Reject(id string) bool {
	return q.removeWithStatus(id, "pending")
}

// Remove xóa 1 bài đã "queued" khỏi hàng chờ.
func (q *QueueState) Remove(id string) bool {
	return q.removeWithStatus(id, "queued")
}

func (q *QueueState) removeWithStatus(id string, status string) bool {
	for i, s := range q.Songs {
		if s.ID == id && s.Status == status {
			q.Songs = append(q.Songs[:i], q.Songs[i+1:]...)
			return true
		}
	}
	return false
}

// ClearPending xóa hết các bài đang "pending" — host dùng để dọn sạch toàn
// bộ yêu cầu chờ duyệt trong 1 lần bấm.
func (q *QueueState) ClearPending() {
	kept := make([]QueueSong, 0, len(q.Songs))
	for _, s := range q.Songs {
		if s.Status != "pending" {
			kept = append(kept, s)
		}
	}
	q.Songs = kept
}