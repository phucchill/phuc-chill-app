package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	model "music-room/internal/models"
	"music-room/internal/repository"
)

const maxRoomUsers = 10

var hostOnlyMessages = map[string]bool{
	"SYNC_PLAY":          true,
	"SYNC_PAUSE":         true,
	"SYNC_SEEK":          true,
	"SYNC_PROGRESS":      true,
	"JOIN_APPROVE":       true,
	"JOIN_REJECT":        true,
	"END_ROOM":           true,
	"PERMISSIONS_UPDATE": true,
}

type Message struct {
	Type      string          `json:"type"`
	RoomID    string          `json:"roomId"`
	SenderID  string          `json:"senderId"`
	Timestamp int64           `json:"timestamp"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type SyncPayload struct {
	SongID    string  `json:"songId"`
	Progress  float64 `json:"progress"`
	IsPlaying bool    `json:"isPlaying"`
}

type Participant struct {
	ID     string     `json:"id"`
	Name   string     `json:"name"`
	IsHost bool       `json:"isHost"`
	Role   model.Role `json:"role"`
}

type Room struct {
	ID            string
	Type          string
	Privacy       string
	MaxUsers      int
	HostID        string
	Clients       map[*Client]bool
	Pending       map[string]*Client
	ApprovedUsers map[string]bool // user đã được duyệt vào phòng riêng tư
	CurrentSong   string
	IsPlaying     bool
	Progress      float64
	LastUpdated   time.Time
	CloseTimer    *time.Timer
	KTV           *KTVState
	Queue         *QueueState

	// Permissions cấu hình quyền thêm bài hát (Search/Upload/YouTube) —
	// Host chỉnh trong Room Settings qua message PERMISSIONS_UPDATE.
	// Được khởi tạo mặc định (model.DefaultRoomPermissions()) khi phòng
	// vừa tạo, hiện CHƯA được persist qua Mongo (xem models/room.go).
	Permissions model.RoomPermissions

	// CurrentQueueSong lưu metadata (title/artist/thumbnail/songSrc) của
	// bài đang phát, NẾU bài đó tới từ Danh sách chờ (Next/Prev/duyệt).
	// nil nếu host chọn bài trực tiếp từ SongPicker qua SYNC_PLAY (không
	// đi qua hàng chờ) — trường hợp đó Prev sẽ không có gì để lùi về.
	CurrentQueueSong *QueueSong

	// LastRequestAt chống spam: userID -> thời điểm request bài gần nhất.
	LastRequestAt map[string]time.Time

	// ShuffleEnabled/RepeatMode/CurrentSongLiked — điều khiển CÁCH PHÁT
	// nhạc (xem playback_handler.go). Chỉ sống trong bộ nhớ Hub, giống
	// Permissions, KHÔNG persist Mongo.
	//   ShuffleEnabled: true thì PLAYER_NEXT chọn ngẫu nhiên bài "queued"
	//     thay vì lấy bài đầu hàng chờ. Chỉ Host bật/tắt được.
	//   RepeatMode: "off" | "one" | "all". "one" lặp lại đúng bài đang
	//     phát mỗi khi Next/Prev/hết bài. "all" đẩy bài vừa phát xong về
	//     cuối hàng chờ thay vì xóa hẳn, tạo vòng lặp vô hạn qua queue.
	//     Chỉ Host đổi được.
	//   CurrentSongLiked: like dùng CHUNG cho cả phòng, áp dụng cho bài
	//     đang phát — ai cũng bấm được, tự reset về false mỗi khi bài đổi
	//     (Next/Prev/host chọn bài mới từ SongPicker).
	ShuffleEnabled   bool
	RepeatMode       string
	CurrentSongLiked bool
}

func (r *Room) CurrentProgress() float64 {
	if !r.IsPlaying {
		return r.Progress
	}
	return r.Progress + time.Since(r.LastUpdated).Seconds()
}

func (r *Room) Participants() []Participant {
	seen := make(map[string]bool)
	list := make([]Participant, 0, len(r.Clients))

	for c := range r.Clients {
		if seen[c.UserID] {
			continue
		}
		seen[c.UserID] = true

		list = append(list, Participant{
			ID:     c.UserID,
			Name:   c.UserName,
			IsHost: c.UserID == r.HostID,
			Role:   c.Role,
		})
	}

	return list
}

func (r *Room) isHost(userID string) bool {
	return r.HostID == userID
}

func (r *Room) QueueSongs() []QueueSong {
	if r.Queue == nil {
		return []QueueSong{}
	}
	return r.Queue.List()
}

type RoomState struct {
	RoomID       string        `json:"roomId"`
	RoomType     string        `json:"roomType"`
	Privacy      string        `json:"privacy"`
	MaxUsers     int           `json:"maxUsers"`
	HostID       string        `json:"hostId"`
	CurrentSong  string        `json:"currentSong"`
	IsPlaying    bool          `json:"isPlaying"`
	Progress     float64       `json:"progress"`
	Participants []Participant `json:"participants"`

	// Metadata bài đang phát — chỉ có giá trị khi bài tới từ hàng chờ
	// (Next/Prev/QUEUE_APPROVE trực tiếp). Rỗng nếu host chọn qua
	// SongPicker (SYNC_PLAY thuần) như trước giờ — không đổi hành vi cũ.
	SongTitle  string `json:"songTitle,omitempty"`
	SongArtist string `json:"songArtist,omitempty"`
	SongCover  string `json:"songCover,omitempty"`

	ActiveMicUID string             `json:"activeMicUid"`
	MicRequests  []model.MicRequest `json:"micRequests"`

	QueueSongs []QueueSong `json:"queueSongs"`

	// Quyền phòng hiện tại — frontend dùng để gate UI (AddSongDialog,
	// RoomSettingsDialog). Luôn có giá trị (không nil) vì Permissions là
	// struct value, không phải pointer.
	Permissions model.RoomPermissions `json:"permissions"`

	// Điều khiển cách phát nhạc — xem ghi chú ở field tương ứng trên Room.
	ShuffleEnabled   bool   `json:"shuffleEnabled"`
	RepeatMode       string `json:"repeatMode"`
	CurrentSongLiked bool   `json:"currentSongLiked"`
}

type Hub struct {
	Rooms       map[string]*Room
	Register    chan *Client
	Unregister  chan *Client
	Broadcast   chan Message
	MessageRepo *repository.MessageRepo
	RoomRepo    *repository.RoomRepo
	KTVRepo     *repository.KTVRepo

	// UploadDir/UploadPublicPath: set từ main.go NGAY SAU khi gọi NewHub
	// (hub.UploadDir = ...). Dùng ở queue_handler.go để xóa NGAY file
	// upload khi host chủ động xóa/từ chối khỏi hàng chờ — xem ghi chú
	// đầy đủ trong handlers/upload_handler.go. Để trống ("") thì bỏ qua
	// bước xóa sớm này, chỉ còn lưới an toàn là sweeper dọn theo tuổi file.
	UploadDir        string
	UploadPublicPath string

	mu sync.RWMutex
}

func NewHub(
	messageRepo *repository.MessageRepo,
	roomRepo *repository.RoomRepo,
	ktvRepo *repository.KTVRepo,
) *Hub {
	return &Hub{
		Rooms:       make(map[string]*Room),
		Register:    make(chan *Client, 256),
		Unregister:  make(chan *Client, 256),
		Broadcast:   make(chan Message, 512),
		MessageRepo: messageRepo,
		RoomRepo:    roomRepo,
		KTVRepo:     ktvRepo,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.handleRegister(client)

		case client := <-h.Unregister:
			h.handleUnregister(client)

		case msg := <-h.Broadcast:
			h.handleBroadcast(msg)
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	var dbRoomType string
	var dbPrivacy string
	var dbHostID string
	var dbPermissions model.RoomPermissions
	var hasSavedRoom bool

	if h.RoomRepo != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		record, err := h.RoomRepo.FindByRoomID(ctx, client.RoomID)
		cancel()

		if err == nil && record != nil {
			dbRoomType = defaultRoomType(record.RoomType)
			dbPrivacy = defaultPrivacy(record.Privacy)
			dbHostID = record.HostID
			dbPermissions = record.Permissions
			hasSavedRoom = true
		}
	}

	h.mu.Lock()

	room, exists := h.Rooms[client.RoomID]
	if !exists {
		roomType := defaultRoomType(client.RoomType)
		privacy := defaultPrivacy(client.Privacy)
		hostID := client.UserID
		permissions := model.DefaultRoomPermissions()

		if hasSavedRoom {
			roomType = dbRoomType
			privacy = dbPrivacy
			hostID = dbHostID

			// Chỉ tin dbPermissions nếu nó KHÔNG phải zero-value — tài liệu
			// Mongo được tạo trước khi tính năng permissions tồn tại sẽ
			// giải mã field "permissions" thành zero-value (tất cả false),
			// dùng thẳng sẽ vô tình khóa hết quyền của member.
			if !dbPermissions.IsZero() {
				permissions = dbPermissions
			}
		}

		room = &Room{
			ID:            client.RoomID,
			Type:          roomType,
			Privacy:       privacy,
			MaxUsers:      maxRoomUsers,
			HostID:        hostID,
			Clients:       make(map[*Client]bool),
			Pending:       make(map[string]*Client),
			ApprovedUsers: map[string]bool{hostID: true}, // host luôn được duyệt sẵn
			// Chưa có bài nào được chọn khi phòng vừa tạo — KHÔNG hard-code
			// về 1 file mp3 cụ thể nữa (file /public/music/sao-hang-a.mp3 đã
			// bị xóa, toàn bộ nhạc giờ nằm trong /public/Assets/songs).
			// Host phải tự chọn bài từ SongPicker để bắt đầu phát.
			CurrentSong:      "",
			IsPlaying:        false,
			Progress:         0,
			LastUpdated:      time.Now(),
			CloseTimer:       nil,
			KTV:              &KTVState{},
			Queue:            &QueueState{},
			Permissions:      permissions,
			CurrentQueueSong: nil,
			LastRequestAt:    make(map[string]time.Time),
			ShuffleEnabled:   false,
			RepeatMode:       "off",
			CurrentSongLiked: false,
		}

		h.Rooms[client.RoomID] = room
		log.Printf("[Hub] Phòng mới khởi tạo: %s | Type: %s | Privacy: %s | Host: %s",
			client.RoomID, room.Type, room.Privacy, room.HostID)
	}

	if room.CloseTimer != nil {
		room.CloseTimer.Stop()
		room.CloseTimer = nil
	}

	if h.RoomRepo != nil {
		go func(roomID string) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.RoomRepo.Reopen(ctx, roomID); err != nil {
				log.Printf("[Hub] Reopen phòng %s lỗi: %v", roomID, err)
			}
		}(client.RoomID)
	}

	h.removeOldClientLocked(room, client)

	if len(room.Clients) >= room.MaxUsers {
		h.sendDirect(client, "ROOM_FULL", map[string]string{
			"message": "Phòng đã đủ 10 người",
		})
		h.mu.Unlock()
		close(client.Send)
		return
	}

	// Phòng riêng tư: chỉ chặn user chưa từng được duyệt
	// Host và user đã được duyệt trước đó (ví dụ reload) đều vào thẳng
	if room.Privacy == "private" && !room.ApprovedUsers[client.UserID] {
		room.Pending[client.UserID] = client

		h.notifyHostLocked(room, "JOIN_REQUEST", map[string]string{
			"userId":   client.UserID,
			"userName": client.UserName,
		})

		h.sendDirect(client, "WAITING_APPROVAL", map[string]string{
			"message": "Đang chờ host chấp nhận vào phòng",
		})

		h.mu.Unlock()
		log.Printf("[Hub] User %s đang chờ duyệt vào phòng riêng tư %s", client.UserID, client.RoomID)
		return
	}

	if room.Privacy == "private" && room.ApprovedUsers[client.UserID] && client.UserID != room.HostID {
		log.Printf("[Hub] User %s (đã duyệt trước) reconnect vào phòng riêng tư %s", client.UserID, client.RoomID)
	}

	room.Clients[client] = true
	h.mu.Unlock()

	h.broadcastRoomState(client.RoomID)
	log.Printf("[Hub] User %s (%s) vào phòng %s", client.UserID, client.UserName, client.RoomID)
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()

	room, exists := h.Rooms[client.RoomID]
	if !exists {
		h.mu.Unlock()
		return
	}

	if _, ok := room.Pending[client.UserID]; ok {
		delete(room.Pending, client.UserID)
		close(client.Send)
		h.mu.Unlock()
		return
	}

	if _, ok := room.Clients[client]; !ok {
		h.mu.Unlock()
		return
	}

	delete(room.Clients, client)
	close(client.Send)

	log.Printf("[Hub] User %s rời phòng %s", client.UserID, client.RoomID)

	if len(room.Clients) == 0 {
		roomID := client.RoomID

		if room.CloseTimer != nil {
			room.CloseTimer.Stop()
		}

		room.CloseTimer = time.AfterFunc(5*time.Second, func() {
			h.closeRoomIfEmpty(roomID)
		})

		h.mu.Unlock()
		log.Printf("[Hub] Phòng %s đang trống, sẽ đóng sau 5 giây nếu không có ai vào lại", roomID)
		return
	}

	// KHÔNG gán host mới ở đây — host chỉ đổi khi họ chủ động LEAVE_ROOM
	// Nếu host chỉ disconnect/reload thì HostID giữ nguyên, họ reconnect vẫn là host

	h.mu.Unlock()
	h.broadcastRoomState(client.RoomID)
}

func (h *Hub) handleBroadcast(msg Message) {
	h.mu.Lock()

	room, exists := h.Rooms[msg.RoomID]
	if !exists {
		h.mu.Unlock()
		return
	}

	if IsKTVMessage(msg.Type) {
		h.mu.Unlock()
		h.handleKTVMessage(room, msg)
		return
	}

	if IsQueueMessage(msg.Type) {
		h.mu.Unlock()
		h.handleQueueMessage(room, msg)
		return
	}

	if IsPlaybackMessage(msg.Type) {
		h.mu.Unlock()
		h.handlePlaybackMessage(room, msg)
		return
	}

	if hostOnlyMessages[msg.Type] && !room.isHost(msg.SenderID) {
		h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được thực hiện thao tác này")
		h.mu.Unlock()
		return
	}

	switch msg.Type {
	case "JOIN_APPROVE":
		h.handleJoinApproveLocked(room, msg)

	case "JOIN_REJECT":
		h.handleJoinRejectLocked(room, msg)

	case "LEAVE_ROOM":
		// Phương án A: host chủ động rời phòng → gán host mới ngay lập tức
		// Member thường rời → không cần làm gì thêm (handleUnregister lo)
		if room.isHost(msg.SenderID) && len(room.Clients) > 1 {
			for next := range room.Clients {
				if next.UserID != msg.SenderID {
					room.HostID = next.UserID
					room.ApprovedUsers[next.UserID] = true // host mới cũng được duyệt sẵn
					log.Printf("[Hub] Host %s rời phòng %s, host mới: %s",
						msg.SenderID, msg.RoomID, room.HostID)
					break
				}
			}
		}
		// Việc xóa client khỏi room.Clients và broadcast ROOM_STATE mới
		// sẽ do handleUnregister xử lý khi WS thực sự đóng

	case "END_ROOM":
		// Quyền đã được kiểm tra ở hostOnlyMessages — xử lý thật sau unlock

	case "PERMISSIONS_UPDATE":
		// Quyền đã được kiểm tra ở hostOnlyMessages (chỉ host mới tới được đây).
		var p model.RoomPermissions
		if json.Unmarshal(msg.Payload, &p) == nil {
			room.Permissions = p

			if h.RoomRepo != nil {
				go func(roomID string, permissions model.RoomPermissions) {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					if err := h.RoomRepo.UpdatePermissions(ctx, roomID, permissions); err != nil {
						log.Printf("[Hub] Lưu Permissions phòng %s lỗi: %v", roomID, err)
					}
				}(room.ID, p)
			}
		}

	case "SYNC_PLAY":
		var p SyncPayload
		if json.Unmarshal(msg.Payload, &p) == nil {
			if room.CurrentSong != p.SongID {
				// Bài đổi thật sự (không phải resync cùng 1 bài) — reset
				// like, vì like gắn với bài đang phát, không phải phòng.
				room.CurrentSongLiked = false
			}
			room.CurrentSong = p.SongID
			room.Progress = p.Progress
			room.LastUpdated = time.Now()
			room.IsPlaying = true
		}

	case "SYNC_PAUSE":
		var p SyncPayload
		if json.Unmarshal(msg.Payload, &p) == nil {
			room.Progress = p.Progress
			room.LastUpdated = time.Now()
			room.IsPlaying = false
		}

	case "SYNC_SEEK":
		var p SyncPayload
		if json.Unmarshal(msg.Payload, &p) == nil {
			room.Progress = p.Progress
			room.LastUpdated = time.Now()
		}

	case "SYNC_PROGRESS":
		var p SyncPayload
		if json.Unmarshal(msg.Payload, &p) == nil {
			room.CurrentSong = p.SongID
			room.Progress = p.Progress
			room.LastUpdated = time.Now()
			room.IsPlaying = p.IsPlaying
		}

	case "CHAT":
		h.saveChatMessage(msg)
	}

	h.mu.Unlock()

	msg.Timestamp = nowMs()

	if msg.Type == "CHAT" {
		h.broadcastToRoom(msg.RoomID, msg, "")
		return
	}

	if msg.Type == "JOIN_APPROVE" || msg.Type == "JOIN_REJECT" {
		h.broadcastRoomState(msg.RoomID)
		return
	}

	if msg.Type == "PERMISSIONS_UPDATE" {
		h.broadcastRoomState(msg.RoomID)
		return
	}

	if msg.Type == "LEAVE_ROOM" {
		// Không làm gì thêm — handleUnregister sẽ broadcast ROOM_STATE
		// mới sau khi WS đóng và client bị xóa khỏi room.Clients
		return
	}

	if msg.Type == "END_ROOM" {
		h.endRoom(msg.RoomID, "Phòng đã được host kết thúc")
		return
	}

	h.broadcastToRoom(msg.RoomID, msg, msg.SenderID)
}

func (h *Hub) endRoom(roomID string, reason string) {
	h.mu.Lock()
	room, exists := h.Rooms[roomID]
	if !exists {
		h.mu.Unlock()
		return
	}

	if room.CloseTimer != nil {
		room.CloseTimer.Stop()
		room.CloseTimer = nil
	}
	h.mu.Unlock()

	h.broadcastToRoom(roomID, Message{
		Type:      "ROOM_ENDED",
		RoomID:    roomID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload: mustMarshal(map[string]string{
			"message": reason,
		}),
	}, "")

	h.mu.Lock()
	for c := range room.Clients {
		close(c.Send)
	}
	delete(h.Rooms, roomID)
	h.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if h.RoomRepo != nil {
		if err := h.RoomRepo.MarkClosed(ctx, roomID); err != nil {
			log.Printf("[Hub] MarkClosed (END_ROOM) phòng %s lỗi: %v", roomID, err)
		} else {
			log.Printf("[Hub] Host đã kết thúc phòng %s", roomID)
		}
	}

	if h.MessageRepo != nil {
		h.deleteRoomMessages(roomID)
	}
}

func (h *Hub) sendRoomStateToClient(room *Room, client *Client) {
	var songTitle, songArtist, songCover string
	if room.CurrentQueueSong != nil {
		songTitle = room.CurrentQueueSong.Title
		songArtist = room.CurrentQueueSong.Artist
		songCover = room.CurrentQueueSong.Thumbnail
	}

	state := RoomState{
		RoomID:       room.ID,
		RoomType:     room.Type,
		Privacy:      room.Privacy,
		MaxUsers:     room.MaxUsers,
		HostID:       room.HostID,
		CurrentSong:  room.CurrentSong,
		IsPlaying:    room.IsPlaying,
		Progress:     room.CurrentProgress(),
		Participants: room.Participants(),

		SongTitle:  songTitle,
		SongArtist: songArtist,
		SongCover:  songCover,

		ActiveMicUID: room.KTV.ActiveMicUID,
		MicRequests:  room.KTV.GetMicRequests(),

		QueueSongs:  room.QueueSongs(),
		Permissions: room.Permissions,

		ShuffleEnabled:   room.ShuffleEnabled,
		RepeatMode:       room.RepeatMode,
		CurrentSongLiked: room.CurrentSongLiked,
	}

	msg := Message{
		Type:      "ROOM_STATE",
		RoomID:    room.ID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(state),
	}

	select {
	case client.Send <- mustMarshal(msg):
	default:
	}
}

func (h *Hub) handleJoinApproveLocked(room *Room, msg Message) {
	var p struct {
		UserID string `json:"userId"`
	}

	if json.Unmarshal(msg.Payload, &p) != nil || p.UserID == "" {
		return
	}

	client, ok := room.Pending[p.UserID]
	if !ok {
		return
	}

	if len(room.Clients) >= room.MaxUsers {
		h.sendDirect(client, "ROOM_FULL", map[string]string{
			"message": "Phòng đã đủ 10 người",
		})

		delete(room.Pending, p.UserID)
		close(client.Send)
		return
	}

	delete(room.Pending, p.UserID)
	room.ApprovedUsers[p.UserID] = true // ghi nhớ đã duyệt — reload sẽ vào thẳng
	h.removeOldClientLocked(room, client)
	room.Clients[client] = true

	h.sendDirect(client, "JOIN_APPROVED", map[string]string{
		"message": "Host đã chấp nhận bạn vào phòng",
	})

	h.sendRoomStateToClient(room, client)
}

func (h *Hub) handleJoinRejectLocked(room *Room, msg Message) {
	var p struct {
		UserID string `json:"userId"`
	}

	if json.Unmarshal(msg.Payload, &p) != nil || p.UserID == "" {
		return
	}

	client, ok := room.Pending[p.UserID]
	if !ok {
		return
	}

	delete(room.Pending, p.UserID)

	h.sendDirect(client, "JOIN_REJECTED", map[string]string{
		"message": "Host đã từ chối bạn vào phòng",
	})

	close(client.Send)
}

func (h *Hub) saveChatMessage(msg Message) {
	var p struct {
		Content  string `json:"content"`
		UserName string `json:"userName"`
	}

	if json.Unmarshal(msg.Payload, &p) != nil {
		return
	}

	if h.MessageRepo == nil || p.Content == "" {
		return
	}

	err := h.MessageRepo.Create(context.Background(), &model.ChatMessage{
		RoomID:   msg.RoomID,
		SenderID: msg.SenderID,
		UserName: p.UserName,
		Content:  p.Content,
	})

	if err != nil {
		log.Printf("[Hub] Lưu chat lỗi room=%s user=%s: %v", msg.RoomID, msg.SenderID, err)
	}
}

func (h *Hub) deleteRoomMessages(roomID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.MessageRepo.DeleteByRoomID(ctx, roomID); err != nil {
		log.Printf("[Hub] Xóa tin nhắn phòng %s lỗi: %v", roomID, err)
		return
	}

	log.Printf("[Hub] Đã xóa tin nhắn phòng %s", roomID)
}

func (h *Hub) closeRoomIfEmpty(roomID string) {
	h.mu.Lock()

	room, exists := h.Rooms[roomID]
	if !exists {
		h.mu.Unlock()
		return
	}

	if len(room.Clients) > 0 {
		room.CloseTimer = nil
		h.mu.Unlock()
		return
	}

	delete(h.Rooms, roomID)
	h.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if h.RoomRepo != nil {
		if err := h.RoomRepo.MarkClosed(ctx, roomID); err != nil {
			log.Printf("[Hub] MarkClosed phòng %s lỗi: %v", roomID, err)
		} else {
			log.Printf("[Hub] Đã đóng phòng %s vì không còn ai", roomID)
		}
	}

	if h.MessageRepo != nil {
		h.deleteRoomMessages(roomID)
	}
}

func (h *Hub) broadcastRoomState(roomID string) {
	h.mu.RLock()

	room, exists := h.Rooms[roomID]
	if !exists {
		h.mu.RUnlock()
		return
	}

	var songTitle, songArtist, songCover string
	if room.CurrentQueueSong != nil {
		songTitle = room.CurrentQueueSong.Title
		songArtist = room.CurrentQueueSong.Artist
		songCover = room.CurrentQueueSong.Thumbnail
	}

	state := RoomState{
		RoomID:       room.ID,
		RoomType:     room.Type,
		Privacy:      room.Privacy,
		MaxUsers:     room.MaxUsers,
		HostID:       room.HostID,
		CurrentSong:  room.CurrentSong,
		IsPlaying:    room.IsPlaying,
		Progress:     room.CurrentProgress(),
		Participants: room.Participants(),

		SongTitle:  songTitle,
		SongArtist: songArtist,
		SongCover:  songCover,

		ActiveMicUID: room.KTV.ActiveMicUID,
		MicRequests:  room.KTV.GetMicRequests(),

		QueueSongs:  room.QueueSongs(),
		Permissions: room.Permissions,

		ShuffleEnabled:   room.ShuffleEnabled,
		RepeatMode:       room.RepeatMode,
		CurrentSongLiked: room.CurrentSongLiked,
	}

	h.mu.RUnlock()

	h.broadcastToRoom(roomID, Message{
		Type:      "ROOM_STATE",
		RoomID:    roomID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(state),
	}, "")
}

func (h *Hub) broadcastToRoom(roomID string, msg Message, skipUserID string) {
	h.mu.RLock()

	room, exists := h.Rooms[roomID]
	if !exists {
		h.mu.RUnlock()
		return
	}

	targets := make([]*Client, 0, len(room.Clients))

	for c := range room.Clients {
		if c.UserID != skipUserID {
			targets = append(targets, c)
		}
	}

	h.mu.RUnlock()

	payload := mustMarshal(msg)

	for _, c := range targets {
		select {
		case c.Send <- payload:
		default:
			h.Unregister <- c
		}
	}
}

func (h *Hub) notifyHostLocked(room *Room, msgType string, payload any) {
	msg := Message{
		Type:      msgType,
		RoomID:    room.ID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(payload),
	}

	raw := mustMarshal(msg)

	for c := range room.Clients {
		if c.UserID == room.HostID {
			select {
			case c.Send <- raw:
			default:
			}
			return
		}
	}
}

func (h *Hub) sendErrorLocked(room *Room, targetUserID string, errMsg string) {
	h.sendToUserLocked(room, targetUserID, "ERROR", map[string]string{
		"message": errMsg,
	})
}

func (h *Hub) sendToUserLocked(room *Room, targetUserID string, msgType string, payload any) {
	msg := Message{
		Type:      msgType,
		RoomID:    room.ID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(payload),
	}

	raw := mustMarshal(msg)

	for c := range room.Clients {
		if c.UserID == targetUserID {
			select {
			case c.Send <- raw:
			default:
			}
			return
		}
	}
}

func (h *Hub) sendDirect(client *Client, msgType string, payload any) {
	msg := Message{
		Type:      msgType,
		RoomID:    client.RoomID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(payload),
	}

	raw := mustMarshal(msg)

	select {
	case client.Send <- raw:
	default:
	}
}

func (h *Hub) removeOldClientLocked(room *Room, newClient *Client) {
	for oldClient := range room.Clients {
		if oldClient.UserID == newClient.UserID && oldClient != newClient {
			delete(room.Clients, oldClient)

			select {
			case h.Unregister <- oldClient:
			default:
			}

			log.Printf("[Hub] Đã kick session cũ của user %s trong phòng %s", newClient.UserID, newClient.RoomID)
		}
	}
}

func defaultRoomType(v string) string {
	if v == "ktv" {
		return "ktv"
	}
	return "music"
}

func defaultPrivacy(v string) string {
	if v == "private" {
		return "private"
	}
	return "public"
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

func mustMarshal(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("[Hub] json.Marshal error: %v", err)
		return []byte("{}")
	}
	return b
}

func (h *Hub) setClientRole(room *Room, userID string, role model.Role) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range room.Clients {
		if c.UserID == userID {
			c.Role = role
			return
		}
	}
}

func (h *Hub) broadcastRoleUpdate(roomID, userID string, role model.Role) {
	h.broadcastToRoom(roomID, Message{
		Type:      "ROLE_UPDATE",
		RoomID:    roomID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(map[string]interface{}{"userId": userID, "role": role}),
	}, "")
}