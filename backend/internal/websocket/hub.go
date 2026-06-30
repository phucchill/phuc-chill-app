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
	"SYNC_PLAY":     true,
	"SYNC_PAUSE":    true,
	"SYNC_SEEK":     true,
	"SYNC_PROGRESS": true,
	"JOIN_APPROVE":  true,
	"JOIN_REJECT":   true,
	"END_ROOM":      true, // ← chỉ host được kết thúc phòng
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
	ID          string
	Type        string
	Privacy     string
	MaxUsers    int
	HostID      string
	Clients     map[*Client]bool
	Pending     map[string]*Client
	CurrentSong string
	IsPlaying   bool
	Progress    float64
	LastUpdated time.Time
	CloseTimer  *time.Timer
	KTV         *KTVState   // ← KTV state
	Queue       *QueueState // ← Danh sách chờ bài hát của Music Room
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

// QueueSongs trả về danh sách bài hát trong hàng chờ — nil-safe dù room.Queue
// chưa được khởi tạo (phòng tạo từ trước khi có tính năng này).
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

	ActiveMicUID string             `json:"activeMicUid"`
	MicRequests  []model.MicRequest `json:"micRequests"`

	QueueSongs []QueueSong `json:"queueSongs"`
}

type Hub struct {
	Rooms       map[string]*Room
	Register    chan *Client
	Unregister  chan *Client
	Broadcast   chan Message
	MessageRepo *repository.MessageRepo
	RoomRepo    *repository.RoomRepo
	KTVRepo     *repository.KTVRepo // ← KTV repo
	mu          sync.RWMutex
}

func NewHub(
	messageRepo *repository.MessageRepo,
	roomRepo *repository.RoomRepo,
	ktvRepo *repository.KTVRepo, // ← tham số mới
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
	var hasSavedRoom bool

	if h.RoomRepo != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		record, err := h.RoomRepo.FindByRoomID(ctx, client.RoomID)
		cancel()

		if err == nil && record != nil {
			dbRoomType = defaultRoomType(record.RoomType)
			dbPrivacy = defaultPrivacy(record.Privacy)
			dbHostID = record.HostID
			hasSavedRoom = true
		}
	}

	h.mu.Lock()

	room, exists := h.Rooms[client.RoomID]
	if !exists {
		roomType := defaultRoomType(client.RoomType)
		privacy := defaultPrivacy(client.Privacy)
		hostID := client.UserID

		if hasSavedRoom {
			roomType = dbRoomType
			privacy = dbPrivacy
			hostID = dbHostID
		}

		room = &Room{
			ID:          client.RoomID,
			Type:        roomType,
			Privacy:     privacy,
			MaxUsers:    maxRoomUsers,
			HostID:      hostID,
			Clients:     make(map[*Client]bool),
			Pending:     make(map[string]*Client),
			CurrentSong: "/music/sao-hang-a.mp3",
			IsPlaying:   false,
			Progress:    0,
			LastUpdated: time.Now(),
			CloseTimer:  nil,
			KTV:         &KTVState{},   // ← khởi tạo KTV state
			Queue:       &QueueState{}, // ← khởi tạo hàng chờ bài hát
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

	if room.Privacy == "private" && client.UserID != room.HostID {
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
		log.Printf("[Hub] Phòng %s đang trống, sẽ đóng sau 5 giây nếu không ai vào lại", roomID)
		return
	}

	if room.HostID == client.UserID {
		for next := range room.Clients {
			room.HostID = next.UserID
			log.Printf("[Hub] Host mới phòng %s: %s", client.RoomID, room.HostID)
			break
		}
	}

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

	// ── KTV: delegate toàn bộ sang ktv_handler.go ──
	if IsKTVMessage(msg.Type) {
		h.mu.Unlock()
		h.handleKTVMessage(room, msg)
		return
	}

	// ── Danh sách chờ bài hát (Music Room): delegate sang queue_handler.go ──
	if IsQueueMessage(msg.Type) {
		h.mu.Unlock()
		h.handleQueueMessage(room, msg)
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
		// Không cần đổi state phòng ở đây. Phía client (useRoomSocket.ts ->
		// leaveRoom()) tự đóng kết nối WS ngay sau khi gửi message này, nên
		// ReadPump của client sẽ nhận lỗi và đẩy client vào h.Unregister.
		// handleUnregister (ở trên) đã lo sẵn việc xóa client khỏi room,
		// gán host mới nếu cần, và broadcast ROOM_STATE mới cho người còn lại.
		// Case này chỉ để chặn message không bị rơi vào nhánh broadcast
		// nguyên văn ở cuối hàm.

	case "END_ROOM":
		// Quyền hạn (chỉ host) đã được kiểm tra ở hostOnlyMessages phía trên.
		// Xử lý thật sự (broadcast ROOM_ENDED + dọn phòng) nằm ở hàm endRoom,
		// được gọi sau khi unlock — vì nó cần tự lock/unlock lại nhiều lần.

	case "SYNC_PLAY":
		var p SyncPayload
		if json.Unmarshal(msg.Payload, &p) == nil {
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

	// Client tự đóng WS ngay sau khi gửi LEAVE_ROOM — không cần server làm
	// gì thêm, handleUnregister sẽ broadcast ROOM_STATE mới khi client đó
	// thực sự rời (xem comment ở case "LEAVE_ROOM" phía trên).
	if msg.Type == "LEAVE_ROOM" {
		return
	}

	// Host kết thúc phòng: broadcast ROOM_ENDED cho tất cả, dọn phòng + DB.
	if msg.Type == "END_ROOM" {
		h.endRoom(msg.RoomID, "Phòng đã được host kết thúc")
		return
	}

	h.broadcastToRoom(msg.RoomID, msg, msg.SenderID)
}

// endRoom đóng phòng NGAY khi host chủ động kết thúc (message END_ROOM).
// Khác với closeRoomIfEmpty (chờ 5s phòng trống mới đóng), hàm này:
//  1. Broadcast "ROOM_ENDED" cho TẤT CẢ client còn lại trong phòng — phía
//     client (useRoomSocket.ts, case "ROOM_ENDED") sẽ tự đóng WS và điều
//     hướng người dùng về trang chủ.
//  2. Đóng Send channel của từng client để WritePump của họ thoát gọn gàng.
//  3. Xóa phòng khỏi h.Rooms, đánh dấu đã đóng trong MongoDB, xóa lịch sử chat.
//
// Lưu ý: phải broadcast TRƯỚC khi xóa phòng khỏi h.Rooms, vì broadcastToRoom
// cần tìm phòng trong map đó để lấy danh sách client — xóa trước sẽ làm
// ROOM_ENDED không gửi được cho ai cả.
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

		ActiveMicUID: room.KTV.ActiveMicUID,
		MicRequests:  room.KTV.GetMicRequests(),

		QueueSongs: room.QueueSongs(),
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

		ActiveMicUID: room.KTV.ActiveMicUID,
		MicRequests:  room.KTV.GetMicRequests(),

		QueueSongs: room.QueueSongs(),
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

			log.Printf("[Hub] Đã kick session cũ của user %s trong phòng %s ra khỏi map", newClient.UserID, newClient.RoomID)
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

// setClientRole cập nhật role cho một client trong phòng (thread-safe)
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

// broadcastRoleUpdate thông báo thay đổi role cho toàn phòng
func (h *Hub) broadcastRoleUpdate(roomID, userID string, role model.Role) {
	h.broadcastToRoom(roomID, Message{
		Type:      "ROLE_UPDATE",
		RoomID:    roomID,
		SenderID:  "server",
		Timestamp: nowMs(),
		Payload:   mustMarshal(map[string]interface{}{"userId": userID, "role": role}),
	}, "")
}