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

	// SongUrl là đường dẫn file mp3 thật (khớp với Room.CurrentSong).
	// Dùng để: (1) chặn request trùng bài đang phát, (2) biết file nào
	// cần load khi Next/Prev chuyển bài.
	SongUrl string `json:"songSrc,omitempty"`
}

// QueueState quản lý hàng chờ bài hát của 1 phòng. Giống KTVState, KHÔNG có
// mutex riêng — luôn được truy cập trong lúc Hub đang giữ h.mu (xem
// queue_handler.go), nên không cần lock thêm ở đây.
type QueueState struct {
	Songs []QueueSong

	// History là ngăn xếp (stack) các bài đã phát trước đó, dùng cho nút
	// Prev. Phần tử cuối cùng là bài phát gần nhất trước bài hiện tại.
	History []QueueSong
}

const maxHistorySize = 50

// List trả về danh sách bài hát hiện tại (không bao giờ trả về nil, để
// JSON trả ra luôn là [] thay vì null khi hàng chờ rỗng).
func (q *QueueState) List() []QueueSong {
	if q == nil || q.Songs == nil {
		return []QueueSong{}
	}
	return q.Songs
}

// AddQueued thêm 1 bài đã ở trạng thái "queued" — dùng khi HOST tự thêm,
// bỏ qua bước duyệt. Vì luôn append vào cuối, thứ tự tự nhiên = thứ tự
// host thêm (tương đương "thứ tự duyệt" vì host thêm = duyệt ngay).
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

// FindByID trả về bản sao bài hát khớp ID (không phân biệt status), dùng
// để lấy thông tin (vd RequestedBy, Title) TRƯỚC khi Reject/Remove xóa nó.
func (q *QueueState) FindByID(id string) (QueueSong, bool) {
	for _, s := range q.Songs {
		if s.ID == id {
			return s, true
		}
	}
	return QueueSong{}, false
}

// Approve chuyển 1 bài từ "pending" -> "queued".
// QUAN TRỌNG: bài được approve sẽ dời xuống CUỐI danh sách, để thứ tự
// hàng chờ "queued" luôn phản ánh đúng THỨ TỰ HOST DUYỆT, không phải thứ
// tự người dùng request.
// Trả về false nếu không tìm thấy bài đang "pending" với ID tương ứng.
func (q *QueueState) Approve(id string) bool {
	for i := range q.Songs {
		if q.Songs[i].ID == id && q.Songs[i].Status == "pending" {
			song := q.Songs[i]
			song.Status = "queued"

			q.Songs = append(q.Songs[:i], q.Songs[i+1:]...)
			q.Songs = append(q.Songs, song)
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

// PopNextQueued lấy bài "queued" ĐẦU TIÊN trong hàng chờ (theo thứ tự đã
// duyệt) và xóa nó khỏi Songs. Dùng cho PLAYER_NEXT / auto-next.
func (q *QueueState) PopNextQueued() (QueueSong, bool) {
	for i, s := range q.Songs {
		if s.Status == "queued" {
			song := s
			q.Songs = append(q.Songs[:i], q.Songs[i+1:]...)
			return song, true
		}
	}
	return QueueSong{}, false
}

// PushFrontQueued đưa 1 bài trở lại ĐẦU hàng chờ ở trạng thái "queued".
// Dùng khi PLAYER_PREV: bài đang phát bị "lùi lại" cần nằm ngay đầu hàng
// chờ để có thể Next tới lại đúng bài đó.
func (q *QueueState) PushFrontQueued(song QueueSong) {
	song.Status = "queued"
	q.Songs = append([]QueueSong{song}, q.Songs...)
}

// PushHistory lưu 1 bài vừa rời khỏi vị trí "đang phát" vào lịch sử, giới
// hạn kích thước để tránh phình bộ nhớ nếu phòng mở rất lâu.
func (q *QueueState) PushHistory(song QueueSong) {
	q.History = append(q.History, song)
	if len(q.History) > maxHistorySize {
		q.History = q.History[len(q.History)-maxHistorySize:]
	}
}

// PopHistory lấy bài gần nhất trong lịch sử ra (LIFO) — dùng cho Prev.
func (q *QueueState) PopHistory() (QueueSong, bool) {
	if len(q.History) == 0 {
		return QueueSong{}, false
	}
	last := q.History[len(q.History)-1]
	q.History = q.History[:len(q.History)-1]
	return last, true
}