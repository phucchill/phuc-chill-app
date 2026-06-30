package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
	model "music-room/internal/models"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 8) / 10
	maxMessageSize = 8 * 1024
	sendBufferSize = 256
)

var allowedTypes = map[string]bool{
	// Music sync
	"SYNC_PLAY": true, "SYNC_PAUSE": true, "SYNC_SEEK": true, "SYNC_PROGRESS": true,
	// Chat
	"CHAT": true,
	// Room
	"JOIN_APPROVE": true, "JOIN_REJECT": true,
	"LEAVE_ROOM": true, "END_ROOM": true,
	// Music Room queue (khác với KTV "SONG_QUEUE_*" ở dưới)
	"QUEUE_REQUEST": true, "QUEUE_APPROVE": true, "QUEUE_REJECT": true,
	"QUEUE_REMOVE": true, "QUEUE_CLEAR_PENDING": true,
	// KTV queue
	"SONG_QUEUE_ADD": true, "SONG_QUEUE_REMOVE": true, "SONG_QUEUE_NEXT": true,
	// KTV mic
	"MIC_REQUEST": true, "MIC_APPROVE": true, "MIC_REJECT": true, "MIC_RELEASE": true,
	// KTV gift
	"GIFT_SEND": true,
	// KTV PK
	"PK_CHALLENGE": true, "PK_VOTE": true, "PK_END": true,
}

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	UserID   string
	UserName string
	RoomID   string
	RoomType string
	Privacy  string
	Role     model.Role // host | mic | viewer
}

func NewClient(hub *Hub, conn *websocket.Conn, userID, userName, roomID, roomType, privacy string) *Client {
	return &Client{
		Hub: hub, Conn: conn,
		Send:     make(chan []byte, sendBufferSize),
		UserID:   userID,
		UserName: userName,
		RoomID:   roomID,
		RoomType: roomType,
		Privacy:  privacy,
		Role:     model.RoleViewer,
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
		log.Printf("[Client] ReadPump kết thúc: userID=%s roomID=%s", c.UserID, c.RoomID)
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client] Lỗi bất ngờ userID=%s: %v", c.UserID, err)
			}
			return
		}

		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("[Client] JSON parse error userID=%s: %v", c.UserID, err)
			continue
		}

		msg.SenderID = c.UserID
		msg.RoomID = c.RoomID

		if !allowedTypes[msg.Type] {
			log.Printf("[Client] Type không được phép từ %s: %q", c.UserID, msg.Type)
			continue
		}

		select {
		case c.Hub.Broadcast <- msg:
		default:
			log.Printf("[Client] Broadcast đầy, drop msg từ %s type=%s", c.UserID, msg.Type)
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
		log.Printf("[Client] WritePump kết thúc: userID=%s", c.UserID)
	}()

	for {
		select {
		case payload, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(payload)
			pending := len(c.Send)
			for i := 0; i < pending; i++ {
				_, _ = w.Write([]byte("\n"))
				_, _ = w.Write(<-c.Send)
			}
			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("[Client] Ping thất bại userID=%s: %v", c.UserID, err)
				return
			}
		}
	}
}