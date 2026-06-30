package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	model "music-room/internal/models"
	"music-room/internal/repository"
)

type RoomHandler struct {
	RoomRepo    *repository.RoomRepo
	MessageRepo *repository.MessageRepo
}

func NewRoomHandler(roomRepo *repository.RoomRepo, messageRepo *repository.MessageRepo) *RoomHandler {
	return &RoomHandler{
		RoomRepo:    roomRepo,
		MessageRepo: messageRepo,
	}
}

type CreateRoomRequest struct {
	RoomID   string `json:"roomId"`
	RoomName string `json:"roomName"`
	RoomType string `json:"roomType"`
	Privacy  string `json:"privacy"`
	HostID   string `json:"hostId"`
}

func (h *RoomHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var req CreateRoomRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Body không hợp lệ", http.StatusBadRequest)
		return
	}

	if req.RoomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	if req.RoomName == "" {
		http.Error(w, "roomName is required", http.StatusBadRequest)
		return
	}

	if req.HostID == "" {
		http.Error(w, "hostId is required", http.StatusBadRequest)
		return
	}

	if req.RoomType != "ktv" {
		req.RoomType = "music"
	}

	if req.Privacy != "private" {
		req.Privacy = "public"
	}

	now := time.Now()

	room := &model.RoomRecord{
		RoomID:      req.RoomID,
		RoomName:    req.RoomName,
		RoomType:    req.RoomType,
		Privacy:     req.Privacy,
		MaxUsers:    10,
		HostID:      req.HostID,
		CurrentSong: "/music/sao-hang-a.mp3",
		IsPlaying:   false,
		Progress:    0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := h.RoomRepo.Upsert(r.Context(), room); err != nil {
		log.Printf("[RoomHandler] Tạo phòng lỗi room=%s: %v", req.RoomID, err)
		http.Error(w, "Tạo phòng lỗi", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, room)
}

func (h *RoomHandler) GetRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.RoomRepo.ListOpen(r.Context())
	if err != nil {
		log.Printf("[RoomHandler] Lấy danh sách phòng lỗi: %v", err)
		http.Error(w, "Lấy danh sách phòng lỗi", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, rooms)
}

func (h *RoomHandler) GetRoomByID(w http.ResponseWriter, r *http.Request, roomID string) {
	if roomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	room, err := h.RoomRepo.FindByRoomID(r.Context(), roomID)
	if err != nil {
		log.Printf("[RoomHandler] Lấy phòng lỗi room=%s: %v", roomID, err)
		http.Error(w, "Lấy phòng lỗi", http.StatusInternalServerError)
		return
	}

	if room == nil {
		http.Error(w, "Không tìm thấy phòng", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, room)
}

func (h *RoomHandler) GetMessagesByRoomID(w http.ResponseWriter, r *http.Request, roomID string) {
	if roomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	messages, err := h.MessageRepo.FindByRoomID(r.Context(), roomID)
	if err != nil {
		log.Printf("[RoomHandler] Lấy lịch sử chat lỗi room=%s: %v", roomID, err)
		http.Error(w, "Lấy lịch sử chat lỗi", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, messages)
}

func (h *RoomHandler) CloseRoom(w http.ResponseWriter, r *http.Request, roomID string) {
	if roomID == "" {
		http.Error(w, "roomId is required", http.StatusBadRequest)
		return
	}

	if err := h.RoomRepo.MarkClosed(r.Context(), roomID); err != nil {
		log.Printf("[RoomHandler] Đóng phòng lỗi room=%s: %v", roomID, err)
		http.Error(w, "Đóng phòng lỗi", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Đóng phòng thành công",
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}