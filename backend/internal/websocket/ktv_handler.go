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

	"MIC_REQUEST": true,
	"MIC_APPROVE": true,
	"MIC_REJECT":  true,
	"MIC_RELEASE": true,
	"MIC_KICK":    true,

	"CAMERA_TOGGLE":  true,
	"SPEAKING_UPDATE": true,

	"GIFT_SEND": true,

	"PK_CHALLENGE":    true,
	"PK_VOTE":         true,
	"PK_END":          true,
	"PK_SCORE_UPDATE": true,

	"PERFORMANCE_START": true,
	"PERFORMANCE_LIKE":  true,
	"PERFORMANCE_END":   true,

	"WEBRTC_OFFER":          true,
	"WEBRTC_ANSWER":         true,
	"WEBRTC_ICE_CANDIDATE":  true,
	"REACTION_SEND":   true, // MỚI
	"KICK_FROM_ROOM":  true, // MỚI
}

// Host-only KTV actions
var ktvHostOnlyMessages = map[string]bool{
	"SONG_QUEUE_REMOVE": true,
	"SONG_QUEUE_NEXT":   true,
	"MIC_APPROVE":       true,
	"MIC_REJECT":        true,
	"MIC_KICK":          true,
	"KICK_FROM_ROOM":    true, 
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
	case "MIC_KICK":
		h.handleMicKick(room, msg, payload)

	case "CAMERA_TOGGLE":
		h.handleCameraToggle(room, msg, payload)
	case "SPEAKING_UPDATE":
		h.handleSpeakingUpdate(room, msg, payload)

	case "GIFT_SEND":
		h.handleGiftSend(room, msg, payload)

	case "PK_CHALLENGE":
		h.handlePKChallenge(room, msg, payload)
	case "PK_VOTE":
		h.handlePKVote(room, msg, payload)
	case "PK_END":
		h.handlePKEnd(room, msg)

	case "PERFORMANCE_START":
		h.handlePerformanceStart(room, msg, payload)
	case "PERFORMANCE_LIKE":
		h.handlePerformanceLike(room, msg)
	case "PERFORMANCE_END":
		h.handlePerformanceEnd(room, msg)
	case "REACTION_SEND":
		h.handleReactionSend(room, msg, payload)
	case "KICK_FROM_ROOM":
		h.handleKickFromRoom(room, msg, payload)	

	case "WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE_CANDIDATE":
		h.handleWebRTCSignal(room, msg, payload)
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

// ─── Mic Requests (hàng chờ xin mic) ────────────────────────────────────────────

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

// ─── Mic Slots (6 ghế) ──────────────────────────────────────────────────────────

func (h *Hub) handleMicApprove(room *Room, msg Message, payload map[string]interface{}) {
	userID := strVal(payload["userId"])
	userName := strVal(payload["userName"])
	if userID == "" {
		return
	}
	idx, ok := room.KTV.ApproveMic(userID, userName)
	if !ok {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Đã hết ghế mic (tối đa 6) hoặc không tìm thấy yêu cầu")
		h.mu.Unlock()
		return
	}
	log.Printf("[KTV] Host duyệt mic cho %s → ghế %d phòng %s", userID, idx, msg.RoomID)
	h.setClientRole(room, userID, model.RoleMic)
	h.broadcastRoleUpdate(msg.RoomID, userID, model.RoleMic)
	h.broadcastMicSlots(room)
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

// MIC_RELEASE — tự nguyện rời ghế (không cần payload, luôn là chính người gửi).
func (h *Hub) handleMicRelease(room *Room, msg Message) {
	idx, ok := room.KTV.ReleaseMicByUser(msg.SenderID)
	if !ok {
		return
	}
	log.Printf("[KTV] %s rời ghế mic %d phòng %s", msg.SenderID, idx, msg.RoomID)
	h.setClientRole(room, msg.SenderID, model.RoleViewer)
	h.broadcastRoleUpdate(msg.RoomID, msg.SenderID, model.RoleViewer)
	h.broadcastMicSlots(room)
}

// MIC_KICK — host chủ động gỡ 1 user khỏi ghế mic của họ.
func (h *Hub) handleMicKick(room *Room, msg Message, payload map[string]interface{}) {
	userID := strVal(payload["userId"])
	if userID == "" {
		return
	}
	idx, ok := room.KTV.ReleaseMicByUser(userID)
	if !ok {
		return
	}
	log.Printf("[KTV] Host gỡ mic của %s (ghế %d) phòng %s", userID, idx, msg.RoomID)
	h.setClientRole(room, userID, model.RoleViewer)
	h.broadcastRoleUpdate(msg.RoomID, userID, model.RoleViewer)
	h.mu.RLock()
	h.sendToUserLocked(room, userID, "MIC_KICKED", map[string]string{
		"message": "Host đã tắt mic của bạn",
	})
	h.mu.RUnlock()
	h.broadcastMicSlots(room)
}

func (h *Hub) handleCameraToggle(room *Room, msg Message, payload map[string]interface{}) {
	on, _ := payload["on"].(bool)
	idx, ok := room.KTV.SetCamera(msg.SenderID, on)
	if !ok {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Bạn phải đang giữ mic mới bật được camera")
		h.mu.Unlock()
		return
	}
	log.Printf("[KTV] %s camera=%v (ghế %d) phòng %s", msg.SenderID, on, idx, msg.RoomID)
	h.broadcastMicSlots(room)
}

// SPEAKING_UPDATE — client tự phát hiện voice-activity, gửi lên để hiện
// hiệu ứng glow nhẹ quanh avatar. Client nên tự throttle (~300-500ms) trước
// khi gửi để tránh spam broadcast.
func (h *Hub) handleSpeakingUpdate(room *Room, msg Message, payload map[string]interface{}) {
	speaking, _ := payload["speaking"].(bool)
	if !room.KTV.SetSpeaking(msg.SenderID, speaking) {
		return
	}
	h.broadcastMicSlots(room)
}

func (h *Hub) broadcastMicSlots(room *Room) {
	h.broadcastToRoom(room.ID, Message{
		Type: "MIC_SLOTS_UPDATE", RoomID: room.ID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{"slots": room.KTV.GetMicSlots()}),
	}, "")
}

func (h *Hub) broadcastRoomMode(room *Room, mode model.RoomMode) {
	h.broadcastToRoom(room.ID, Message{
		Type: "ROOM_MODE_UPDATE", RoomID: room.ID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{"mode": mode}),
	}, "")
}

// ─── Performance (Spotlight) ────────────────────────────────────────────────────

func (h *Hub) handlePerformanceStart(room *Room, msg Message, payload map[string]interface{}) {
	singerID := strVal(payload["singerId"])
	if singerID == "" {
		singerID = msg.SenderID
	}
	// Chỉ chính chủ mic hoặc host mới được spotlight người đó.
	if msg.SenderID != singerID && !room.isHost(msg.SenderID) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Không có quyền spotlight người khác")
		h.mu.Unlock()
		return
	}
	if !room.KTV.IsOnMic(singerID) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Phải đang giữ mic mới bắt đầu trình diễn được")
		h.mu.Unlock()
		return
	}

	singerName := strVal(payload["singerName"])
	songTitle := strVal(payload["songTitle"])
	songArtist := strVal(payload["songArtist"])
	lyrics := strVal(payload["lyrics"])             // MỚI
	albumCoverURL := strVal(payload["albumCoverUrl"]) // MỚI

	room.KTV.StartPerformance(singerID, singerName, songTitle, songArtist, lyrics, albumCoverURL)
	log.Printf("[KTV] Spotlight: %s hát '%s' phòng %s", singerName, songTitle, msg.RoomID)

	h.broadcastToRoom(msg.RoomID, Message{
		Type: "PERFORMANCE_START", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"singerId": singerID, "singerName": singerName,
			"songTitle": songTitle, "songArtist": songArtist,
			"lyrics": lyrics, "albumCoverUrl": albumCoverURL, // MỚI
		}),
	}, "")
	h.broadcastRoomMode(room, model.ModePerformance)
}

func (h *Hub) handlePerformanceLike(room *Room, msg Message) {
	likes := room.KTV.AddPerformanceLike()
	if likes == 0 {
		return
	}
	h.broadcastToRoom(msg.RoomID, Message{
		Type: "PERFORMANCE_LIKE_UPDATE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{"likes": likes, "fromUserId": msg.SenderID}),
	}, "")
}

func (h *Hub) handlePerformanceEnd(room *Room, msg Message) {
	perf := room.KTV.GetCurrentPerformance()
	if perf == nil {
		return
	}
	// Chính ca sĩ hoặc host mới được kết thúc buổi trình diễn.
	if msg.SenderID != perf.SingerID && !room.isHost(msg.SenderID) {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Không có quyền kết thúc trình diễn")
		h.mu.Unlock()
		return
	}

	h.mu.RLock()
	audienceCount := len(room.Clients)
	h.mu.RUnlock()

	entry := room.KTV.EndPerformance(audienceCount)
	if entry == nil {
		return
	}
	room.KTV.SetMode(model.ModeLounge)

	log.Printf("[KTV] Kết thúc trình diễn '%s' (%ds, %d likes) phòng %s",
		entry.SongTitle, entry.DurationSec, entry.Likes, msg.RoomID)

	h.broadcastToRoom(msg.RoomID, Message{
		Type: "PERFORMANCE_END", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(entry),
	}, "")
	h.broadcastRoomMode(room, model.ModeLounge)
}

// ─── Gift ─────────────────────────────────────────────────────────────────────

func (h *Hub) handleGiftSend(room *Room, msg Message, payload map[string]interface{}) {
	giftType := strVal(payload["giftType"])
	toUserID := strVal(payload["toUserId"])

	if toUserID == "" || giftType == "" {
		h.mu.Lock()
		h.sendErrorLocked(room, msg.SenderID, "Thông tin quà không hợp lệ")
		h.mu.Unlock()
		return
	}

	giftCost := model.GiftCost[giftType]
	if giftCost == 0 {
		giftCost = 10
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

		h.broadcastToRoom(msg.RoomID, Message{
			Type: "PK_SCORE_UPDATE", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
			Payload: mustMarshal(map[string]interface{}{
				"challengerScore":     pkUpdated.ChallengerScore,
				"opponentScore":       pkUpdated.OpponentScore,
				"challengerGiftScore": pkUpdated.ChallengerGiftScore,
				"opponentGiftScore":   pkUpdated.OpponentGiftScore,
				"fromUserId":          gift.FromUserID,
				"fromUserName":        gift.FromUserName,
				"toUserId":            toUserID,
				"giftEmoji":           gift.GiftEmoji,
				"giftScore":           totalScore,
			}),
		}, "")
	}

	// ── Nếu người nhận đang giữ ghế mic → cộng điểm quà vào badge ghế ──
	if room.KTV.IsOnMic(toUserID) {
		room.KTV.AddSlotGiftScore(toUserID, totalScore)
		h.broadcastMicSlots(room)
	}

	// ── Nếu người nhận đang là ca sĩ được spotlight → cộng vào performance ──
	if perf := room.KTV.GetCurrentPerformance(); perf != nil && perf.SingerID == toUserID {
		room.KTV.AddPerformanceGift(totalScore)
	}

	log.Printf("[KTV] %s tặng %s cho %s phòng %s (cost=%d addedToPK=%v)",
		gift.FromUserName, gift.GiftName, gift.ToUserName, msg.RoomID, giftCost, gift.AddedToPK)

	if h.KTVRepo != nil {
		go func(g model.GiftEvent) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := h.KTVRepo.SaveGift(ctx, &g); err != nil {
				log.Printf("[KTV] Lưu gift lỗi: %v", err)
			}
		}(gift)
	}

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
	h.broadcastRoomMode(room, model.ModePK)

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
	side := strVal(payload["side"])
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

	room.KTV.RecordPKWin(battle.WinnerID, battle.WinnerName)

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

	// Theo spec: PK kết thúc → luôn quay về Lounge Mode.
	room.KTV.SetMode(model.ModeLounge)
	h.broadcastRoomMode(room, model.ModeLounge)
}

// ─── WebRTC Signaling (relay-only, media đi P2P giữa các client) ───────────────

// handleWebRTCSignal chuyển tiếp offer/answer/ICE candidate tới đúng
// targetUserId. Server KHÔNG xử lý media, chỉ đóng vai trò signaling relay.
// payload bắt buộc phải có "targetUserId"; "fromUserId" luôn bị ghi đè bằng
// msg.SenderID thật để chống giả mạo danh tính người gửi.
func (h *Hub) handleWebRTCSignal(room *Room, msg Message, payload map[string]interface{}) {
	targetUserID := strVal(payload["targetUserId"])
	if targetUserID == "" {
		return
	}
	payload["fromUserId"] = msg.SenderID
	h.mu.RLock()
	h.sendToUserLocked(room, targetUserID, msg.Type, payload)
	h.mu.RUnlock()
}
// ─── Reaction (floating reaction — broadcast toàn phòng, không lưu DB) ──────────

// handleReactionSend broadcast reaction bay cho toàn phòng. Không giới hạn
// tần suất ở tầng server (nếu spam trở thành vấn đề thật, thêm rate-limit
// tương tự LastRequestAt của Music Room queue).
func (h *Hub) handleReactionSend(room *Room, msg Message, payload map[string]interface{}) {
	emoji := strVal(payload["emoji"])
	if !model.ValidReactions[emoji] {
		return // âm thầm bỏ qua emoji không hợp lệ, không cần báo lỗi cho client
	}
	fromUserName := strVal(payload["fromUserName"])

	h.broadcastToRoom(msg.RoomID, Message{
		Type: "REACTION_BROADCAST", RoomID: msg.RoomID, SenderID: "server", Timestamp: nowMs(),
		Payload: mustMarshal(map[string]interface{}{
			"fromUserId":   msg.SenderID,
			"fromUserName": fromUserName,
			"emoji":        emoji,
			"timestamp":    nowMs(),
		}),
	}, "")
}

// ─── Kick khỏi phòng (khác MIC_KICK — gỡ hẳn khỏi phòng, không chỉ mic) ─────────

func (h *Hub) handleKickFromRoom(room *Room, msg Message, payload map[string]interface{}) {
	targetUserID := strVal(payload["userId"])
	if targetUserID == "" || targetUserID == room.HostID {
		return // không tự kick chính mình / không kick host
	}

	if _, onMic := room.KTV.ReleaseMicByUser(targetUserID); onMic {
		h.broadcastMicSlots(room)
	}

	h.mu.Lock()
	if room.BannedUsers == nil { // phòng thủ — tránh nil-panic nếu Room chưa được khởi tạo field này khi tạo mới
		room.BannedUsers = make(map[string]bool)
	}
	room.BannedUsers[targetUserID] = true
	delete(room.ApprovedUsers, targetUserID)

	var target *Client
	for c := range room.Clients {
		if c.UserID == targetUserID {
			target = c
			break
		}
	}
	h.mu.Unlock()

	if target == nil {
		log.Printf("[KTV] Kick %s khỏi phòng %s nhưng không tìm thấy client đang kết nối", targetUserID, msg.RoomID)
		return
	}

	log.Printf("[KTV] Host kick %s khỏi phòng %s", targetUserID, msg.RoomID)

	h.sendDirect(target, "KICKED_FROM_ROOM", map[string]string{
		"message": "Host đã mời bạn ra khỏi phòng",
	})

	h.Unregister <- target
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func strVal(v interface{}) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}

func intVal(v interface{}, fallback int) int {
	if v == nil {
		return fallback
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return fallback
}

func int64Val(v interface{}, fallback int64) int64 {
	if v == nil {
		return fallback
	}
	if n, ok := v.(float64); ok {
		return int64(n)
	}
	return fallback
}