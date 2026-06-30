package websocket

import (
	"context"
	"encoding/json"
	"log"
	"time"

	model "music-room/internal/models"
)

var ktvMessages = map[string]bool{
	"SONG_QUEUE_ADD":    true,
	"SONG_QUEUE_REMOVE": true,
	"SONG_QUEUE_NEXT":   true,
	"MIC_REQUEST":       true,
	"MIC_APPROVE":       true,
	"MIC_REJECT":        true,
	"MIC_RELEASE":       true,
	"GIFT_SEND":         true,
	"PK_CHALLENGE":      true,
	"PK_VOTE":           true,
	"PK_END":            true,
	"PK_SCORE_UPDATE":   true,
}

// Host-only KTV actions
var ktvHostOnlyMessages = map[string]bool{
	"SONG_QUEUE_REMOVE": true,
	"SONG_QUEUE_NEXT":   true,
	"MIC_APPROVE":       true,
	"MIC_REJECT":        true,
}

func IsKTVMessage(msgType string) bool {
	return ktvMessages[msgType]
}

func (h *Hub) handleKTVMessage(room *Room, msg Message) {
	if ktvHostOnlyMessages[msg.Type] && !room.isHost(msg.SenderID) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Chỉ host mới được thực hiện thao tác này")
		h.mu.Unlock()
		return
	}

	payload := make(map[string]interface{})
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		log.Printf("[KTV] Parse payload lỗi: %v", err)
		return
	}

	switch msg.Type {
	case "SONG_QUEUE_ADD":
		h.handleSongQueueAdd(room, msg, payload)
	case "SONG_QUEUE_REMOVE":
		h.handleSongQueueRemove(room, msg, payload)
	case "SONG_QUEUE_NEXT":
		h.handleSongQueueNext(room, msg)
	case "MIC_REQUEST":
		h.handleMicRequest(room, msg, payload)
	case "MIC_APPROVE":
		h.handleMicApprove(room, msg, payload)
	case "MIC_REJECT":
		h.handleMicReject(room, msg, payload)
	case "MIC_RELEASE":
		h.handleMicRelease(room, msg)
	case "GIFT_SEND":
		h.handleGiftSend(room, msg, payload)
	case "PK_CHALLENGE":
		h.handlePKChallenge(room, msg, payload)
	case "PK_VOTE":
		h.handlePKVote(room, msg, payload)
	case "PK_END":
		h.handlePKEnd(room, msg)
	}
}

// ─── Song Queue ───────────────────────────────────────────────────────────────

func (h *Hub) handleSongQueueAdd(room *Room, msg Message, payload map[string]interface{}) {
	item := model.SongQueueItem{
		ID:              strVal(payload["id"]),
		Title:           strVal(payload["title"]),
		Artist:          strVal(payload["artist"]),
		SongURL:         strVal(payload["url"]),
		RequestedBy:     strVal(payload["requestedBy"]),
		RequestedByName: strVal(payload["requestedByName"]),
		AddedAt:         time.Now(),
	}
	if item.ID == "" || item.Title == "" {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Thiếu thông tin bài hát")
		h.mu.Unlock()
		return
	}
	if !room.KTV.AddSong(item) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Bài hát đã có trong hàng đợi")
		h.mu.Unlock()
		return
	}
	log.Printf("[KTV] %s thêm bài '%s' phòng %s", msg.SenderID, item.Title, msg.RoomID)
	h.broadcastQueueUpdate(room)
}

func (h *Hub) handleSongQueueRemove(room *Room, msg Message, payload map[string]interface{}) {
	id := strVal(payload["id"])
	if id == "" || !room.KTV.RemoveSong(id) {
		return
	}
	log.Printf("[KTV] Xóa bài id=%s phòng %s", id, msg.RoomID)
	h.broadcastQueueUpdate(room)
}

func (h *Hub) handleSongQueueNext(room *Room, msg Message) {
	next := room.KTV.NextSong()
	if next == nil {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Hàng đợi đã trống")
		h.mu.Unlock()
		return
	}
	h.mu.Lock()
	room.CurrentSong = next.SongURL
	room.IsPlaying = true
	room.Progress = 0
	room.LastUpdated = time.Now()
	h.mu.Unlock()

	h.broadcastToRoom(msg.RoomID, Message{
		Type: "SYNC_PLAY", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"songId": next.SongURL, "progress": 0, "isPlaying": true,
			"songTitle": next.Title, "songArtist": next.Artist,
		}),
	}, "")
	h.broadcastQueueUpdate(room)
	log.Printf("[KTV] Phát bài '%s' phòng %s", next.Title, msg.RoomID)
}

func (h *Hub) broadcastQueueUpdate(room *Room) {
	h.broadcastToRoom(room.ID, Message{
		Type: "SONG_QUEUE_UPDATE", RoomID: room.ID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{"queue": room.KTV.GetQueue()}),
	}, "")
}

// ─── Mic ──────────────────────────────────────────────────────────────────────

func (h *Hub) handleMicRequest(room *Room, msg Message, payload map[string]interface{}) {
	req := model.MicRequest{
		UserID:      strVal(payload["userId"]),
		UserName:    strVal(payload["userName"]),
		RequestedAt: time.Now(),
	}
	if req.UserID == "" {
		req.UserID = msg.SenderID
	}
	if !room.KTV.AddMicRequest(req) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Bạn đã có yêu cầu mic đang chờ hoặc đang giữ mic")
		h.mu.Unlock()
		return
	}
	log.Printf("[KTV] %s xin mic phòng %s", req.UserID, msg.RoomID)
	h.mu.RLock()
	h.notifyHostLocked(room, "MIC_REQUEST", map[string]interface{}{
		"userId": req.UserID, "userName": req.UserName,
		"requestedAt": req.RequestedAt.UnixMilli(),
	})
	h.mu.RUnlock()
}

func (h *Hub) handleMicApprove(room *Room, msg Message, payload map[string]interface{}) {
	userID := strVal(payload["userId"])
	userName := strVal(payload["userName"])
	if userID == "" {
		return
	}
	if !room.KTV.ApproveMic(userID, userName) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Không tìm thấy yêu cầu mic")
		h.mu.Unlock()
		return
	}
	log.Printf("[KTV] Host duyệt mic cho %s phòng %s", userID, msg.RoomID)
	h.setClientRole(room, userID, model.RoleMic)
	h.broadcastRoleUpdate(msg.RoomID, userID, model.RoleMic)
	h.broadcastToRoom(msg.RoomID, Message{
		Type: "MIC_APPROVE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]string{"userId": userID, "userName": userName}),
	}, "")
}

func (h *Hub) handleMicReject(room *Room, msg Message, payload map[string]interface{}) {
	userID := strVal(payload["userId"])
	if userID == "" {
		return
	}
	room.KTV.RejectMic(userID)
	log.Printf("[KTV] Host từ chối mic của %s phòng %s", userID, msg.RoomID)
	h.mu.RLock()
	h.sendToUserLocked(room, userID, "MIC_REJECT", map[string]string{
		"userId": userID, "message": "Host đã từ chối yêu cầu mic của bạn",
	})
	h.mu.RUnlock()
}

func (h *Hub) handleMicRelease(room *Room, msg Message) {
	prevUID := room.KTV.ReleaseMic()
	if prevUID == "" {
		return
	}
	log.Printf("[KTV] Mic tắt (trước: %s) phòng %s", prevUID, msg.RoomID)
	h.setClientRole(room, prevUID, model.RoleViewer)
	h.broadcastRoleUpdate(msg.RoomID, prevUID, model.RoleViewer)
	h.broadcastToRoom(msg.RoomID, Message{
		Type: "MIC_RELEASE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]string{"prevUserId": prevUID}),
	}, "")
}

// ─── Gift ─────────────────────────────────────────────────────────────────────

func (h *Hub) handleGiftSend(room *Room, msg Message, payload map[string]interface{}) {
	giftType := strVal(payload["giftType"])
	toUserID  := strVal(payload["toUserId"])

	if toUserID == "" || giftType == "" {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Thông tin quà không hợp lệ")
		h.mu.Unlock()
		return
	}

	// Lấy giá trị quà từ catalog
	giftCost := model.GiftCost[giftType]
	if giftCost == 0 {
		giftCost = 10 // fallback
	}
	quantity := intVal(payload["quantity"], 1)
	totalScore := giftCost * quantity

	gift := model.GiftEvent{
		RoomID:       msg.RoomID,
		FromUserID:   strVal(payload["fromUserId"]),
		FromUserName: strVal(payload["fromUserName"]),
		ToUserID:     toUserID,
		ToUserName:   strVal(payload["toUserName"]),
		GiftType:     giftType,
		GiftEmoji:    strVal(payload["giftEmoji"]),
		GiftName:     strVal(payload["giftName"]),
		GiftCost:     giftCost,
		Quantity:     quantity,
		CreatedAt:    time.Now(),
	}
	if gift.FromUserID == "" {
		gift.FromUserID = msg.SenderID
	}

	// ── Nếu đang PK và người nhận thuộc PK → cộng điểm quà ──
	pkUpdated := room.KTV.AddGiftVote(toUserID, gift.FromUserID, totalScore)
	if pkUpdated != nil {
		gift.AddedToPK = true
		log.Printf("[KTV] Quà %s (+%d điểm) cộng vào PK phòng %s", giftType, totalScore, msg.RoomID)

		// Broadcast cập nhật điểm PK ngay lập tức
		h.broadcastToRoom(msg.RoomID, Message{
			Type: "PK_SCORE_UPDATE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
			Payload: mustMarshal(map[string]interface{}{
				"challengerScore": pkUpdated.ChallengerScore,
				"opponentScore":   pkUpdated.OpponentScore,
				"challengerGiftScore": pkUpdated.ChallengerGiftScore,
				"opponentGiftScore":   pkUpdated.OpponentGiftScore,
				"fromUserId":   gift.FromUserID,
				"fromUserName": gift.FromUserName,
				"toUserId":     toUserID,
				"giftEmoji":    gift.GiftEmoji,
				"giftScore":    totalScore,
			}),
		}, "")
	}

	log.Printf("[KTV] %s tặng %s cho %s phòng %s (cost=%d addedToPK=%v)",
		gift.FromUserName, gift.GiftName, gift.ToUserName, msg.RoomID, giftCost, gift.AddedToPK)

	// Lưu DB bất đồng bộ
	if h.KTVRepo != nil {
		go func(g model.GiftEvent) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.KTVRepo.SaveGift(ctx, &g); err != nil {
				log.Printf("[KTV] Lưu gift lỗi: %v", err)
			}
		}(gift)
	}

	// Broadcast animation quà cho toàn phòng
	h.broadcastToRoom(msg.RoomID, Message{
		Type: "GIFT_BROADCAST", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"id":           gift.CreatedAt.UnixNano(),
			"fromUserId":   gift.FromUserID,
			"fromUserName": gift.FromUserName,
			"toUserId":     gift.ToUserID,
			"toUserName":   gift.ToUserName,
			"giftType":     gift.GiftType,
			"giftEmoji":    gift.GiftEmoji,
			"giftName":     gift.GiftName,
			"giftCost":     gift.GiftCost,
			"quantity":     gift.Quantity,
			"addedToPK":    gift.AddedToPK,
			"giftScore":    totalScore,
			"timestamp":    gift.CreatedAt.UnixMilli(),
		}),
	}, "")
}

// ─── PK ───────────────────────────────────────────────────────────────────────

func (h *Hub) handlePKChallenge(room *Room, msg Message, payload map[string]interface{}) {
	endsAtMs := int64Val(payload["endsAt"], time.Now().Add(60*time.Second).UnixMilli())

	battle := &model.PKBattle{
		RoomID:         msg.RoomID,
		ChallengerID:   strVal(payload["challengerId"]),
		ChallengerName: strVal(payload["challengerName"]),
		OpponentID:     strVal(payload["opponentId"]),
		OpponentName:   strVal(payload["opponentName"]),
		StartedAt:      time.Now(),
		EndsAt:         time.UnixMilli(endsAtMs),
		VotedUsers:     []string{},
	}
	if battle.ChallengerID == "" {
		battle.ChallengerID = msg.SenderID
	}
	if battle.OpponentID == "" || battle.ChallengerID == battle.OpponentID {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Thách đấu không hợp lệ")
		h.mu.Unlock()
		return
	}
	if !room.KTV.StartPK(battle) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Đang có trận PK khác diễn ra")
		h.mu.Unlock()
		return
	}

	log.Printf("[KTV] PK bắt đầu: %s vs %s phòng %s", battle.ChallengerName, battle.OpponentName, msg.RoomID)

	h.broadcastToRoom(msg.RoomID, Message{
		Type: "PK_CHALLENGE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"challengerId":   battle.ChallengerID,
			"challengerName": battle.ChallengerName,
			"opponentId":     battle.OpponentID,
			"opponentName":   battle.OpponentName,
			"endsAt":         battle.EndsAt.UnixMilli(),
		}),
	}, "")

	// Auto kết thúc PK đúng giờ
	go func(roomID string, dur time.Duration) {
		time.Sleep(dur)
		h.mu.RLock()
		r, exists := h.Rooms[roomID]
		h.mu.RUnlock()
		if !exists {
			return
		}
		h.handlePKEnd(r, Message{RoomID: roomID, SenderID: "server"})
	}(msg.RoomID, time.Until(battle.EndsAt))
}

func (h *Hub) handlePKVote(room *Room, msg Message, payload map[string]interface{}) {
	voterID := strVal(payload["voterId"])
	side    := strVal(payload["side"])
	if voterID == "" {
		voterID = msg.SenderID
	}
	if side != "challenger" && side != "opponent" {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Side không hợp lệ")
		h.mu.Unlock()
		return
	}

	ok, battle := room.KTV.AddManualVote(voterID, side)
	if !ok {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Bạn đã vote rồi hoặc không có trận PK")
		h.mu.Unlock()
		return
	}

	h.broadcastToRoom(msg.RoomID, Message{
		Type: "PK_VOTE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"voterId":         voterID,
			"side":            side,
			"challengerScore": battle.ChallengerScore,
			"opponentScore":   battle.OpponentScore,
		}),
	}, "")
}

func (h *Hub) handlePKEnd(room *Room, msg Message) {
	battle := room.KTV.EndPK()
	if battle == nil {
		return
	}

	log.Printf("[KTV] PK kết thúc phòng %s | Winner: %s (%d vs %d)",
		msg.RoomID, battle.WinnerName, battle.ChallengerScore, battle.OpponentScore)

	if h.KTVRepo != nil {
		go func(b model.PKBattle) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.KTVRepo.SavePKResult(ctx, &b); err != nil {
				log.Printf("[KTV] Lưu PK result lỗi: %v", err)
			}
		}(*battle)
	}

	// Broadcast PK_RESULT — FE dùng để hiện banner winner 7 giây
	h.broadcastToRoom(msg.RoomID, Message{
		Type: "PK_RESULT", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"challengerId":        battle.ChallengerID,
			"challengerName":      battle.ChallengerName,
			"challengerScore":     battle.ChallengerScore,
			"challengerGiftScore": battle.ChallengerGiftScore,
			"challengerVoteCount": battle.ChallengerVoteCount,
			"opponentId":          battle.OpponentID,
			"opponentName":        battle.OpponentName,
			"opponentScore":       battle.OpponentScore,
			"opponentGiftScore":   battle.OpponentGiftScore,
			"opponentVoteCount":   battle.OpponentVoteCount,
			"winnerId":            battle.WinnerID,
			"winnerName":          battle.WinnerName,
		}),
	}, "")
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func strVal(v interface{}) string {
	if v == nil { return "" }
	s, _ := v.(string)
	return s
}

func intVal(v interface{}, fallback int) int {
	if v == nil { return fallback }
	switch n := v.(type) {
	case float64: return int(n)
	case int:     return n
	}
	return fallback
}

func int64Val(v interface{}, fallback int64) int64 {
	if v == nil { return fallback }
	if n, ok := v.(float64); ok { return int64(n) }
	return fallback
}