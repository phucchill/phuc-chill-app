package websocket

import (
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// TODO production: kiểm tra r.Header.Get("Origin") với allowlist
		return true
	},
}

// ServeWS nâng cấp HTTP request thành WebSocket và đăng ký client vào Hub
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	roomID := strings.TrimSpace(r.URL.Query().Get("roomId"))
	userID := strings.TrimSpace(r.URL.Query().Get("userId"))
	userName := strings.TrimSpace(r.URL.Query().Get("userName"))
	
	// 1. Thêm logic lấy query params cho roomType và privacy ở đây
	roomType := strings.TrimSpace(r.URL.Query().Get("roomType"))
	privacy := strings.TrimSpace(r.URL.Query().Get("privacy"))

	if roomID == "" || userID == "" {
		http.Error(w, "roomId và userId là bắt buộc", http.StatusBadRequest)
		return
	}

	if userName == "" {
		userName = "Khách"
	}

	// Gán giá trị mặc định nếu client không truyền lên
	if roomType == "" {
		roomType = "music"
	}

	if privacy == "" {
		privacy = "public"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Handler] Upgrade thất bại user=%s room=%s: %v", userID, roomID, err)
		return
	}

	// 2. Sửa dòng tạo client để truyền thêm roomType và privacy vào NewClient
	client := NewClient(hub, conn, userID, userName, roomID, roomType, privacy)
	hub.Register <- client

	log.Printf("[Handler] Kết nối mới: userID=%s userName=%s roomID=%s roomType=%s privacy=%s addr=%s",
		userID, userName, roomID, roomType, privacy, conn.RemoteAddr())

	go client.WritePump()
	client.ReadPump() // blocking — giữ goroutine đến khi client ngắt
}