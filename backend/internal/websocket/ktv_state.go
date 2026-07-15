package websocket

import (
	"sync"
	"time"

	model "music-room/internal/models"
)

// KTVState lưu trạng thái KTV in-memory cho một phòng.
type KTVState struct {
	mu sync.RWMutex

	Queue       []model.SongQueueItem
	MicRequests []model.MicRequest

	// 6 ghế mic cố định — slot trống là nil.
	MicSlots [model.MaxMicSlots]*model.MicSlot

	ActivePK *model.PKBattle

	Mode RoomMode1 // xem type alias bên dưới

	CurrentPerformance *model.Performance
	Memory             []model.RoomMemoryEntry

	PKWins     map[string]int    // userID -> số lần thắng PK trong phòng
	PKWinNames map[string]string // userID -> tên hiển thị (cache)
}

// alias để không phải import lặp — dùng thẳng model.RoomMode
type RoomMode1 = model.RoomMode

func NewKTVState() *KTVState {
	return &KTVState{
		Mode:       model.ModeLounge,
		PKWins:     make(map[string]int),
		PKWinNames: make(map[string]string),
	}
}

// ─── Song Queue ───────────────────────────────────────────────────────────────

func (k *KTVState) AddSong(item model.SongQueueItem) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	for _, s := range k.Queue {
		if s.ID == item.ID {
			return false
		}
	}
	if item.AddedAt.IsZero() {
		item.AddedAt = time.Now()
	}
	k.Queue = append(k.Queue, item)
	return true
}

func (k *KTVState) RemoveSong(id string) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	for i, s := range k.Queue {
		if s.ID == id {
			k.Queue = append(k.Queue[:i], k.Queue[i+1:]...)
			return true
		}
	}
	return false
}

func (k *KTVState) NextSong() *model.SongQueueItem {
	k.mu.Lock()
	defer k.mu.Unlock()
	if len(k.Queue) == 0 {
		return nil
	}
	first := k.Queue[0]
	k.Queue = k.Queue[1:]
	return &first
}

func (k *KTVState) GetQueue() []model.SongQueueItem {
	k.mu.RLock()
	defer k.mu.RUnlock()
	cp := make([]model.SongQueueItem, len(k.Queue))
	copy(cp, k.Queue)
	return cp
}

// ─── Mic Requests ───────────────────────────────────────────────────────────────

func (k *KTVState) AddMicRequest(req model.MicRequest) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	for _, s := range k.MicSlots {
		if s != nil && s.UserID == req.UserID {
			return false // đã đang giữ mic
		}
	}
	for _, r := range k.MicRequests {
		if r.UserID == req.UserID {
			return false
		}
	}
	if req.RequestedAt.IsZero() {
		req.RequestedAt = time.Now()
	}
	k.MicRequests = append(k.MicRequests, req)
	return true
}

func (k *KTVState) RejectMic(userID string) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	newList := k.MicRequests[:0]
	found := false
	for _, r := range k.MicRequests {
		if r.UserID == userID {
			found = true
		} else {
			newList = append(newList, r)
		}
	}
	k.MicRequests = newList
	return found
}

func (k *KTVState) GetMicRequests() []model.MicRequest {
	k.mu.RLock()
	defer k.mu.RUnlock()
	cp := make([]model.MicRequest, len(k.MicRequests))
	copy(cp, k.MicRequests)
	return cp
}

// ─── Mic Slots (6 ghế) ──────────────────────────────────────────────────────────

// ApproveMic gỡ request khỏi hàng chờ, tìm ghế trống đầu tiên và gán vào đó.
// Trả về (slotIndex, ok). ok=false nếu không tìm thấy request hoặc phòng mic đã đầy.
func (k *KTVState) ApproveMic(userID, userName string) (int, bool) {
	k.mu.Lock()
	defer k.mu.Unlock()

	found := false
	newList := k.MicRequests[:0]
	for _, r := range k.MicRequests {
		if r.UserID == userID {
			found = true
		} else {
			newList = append(newList, r)
		}
	}
	if !found {
		return -1, false
	}
	k.MicRequests = newList

	for i := 0; i < model.MaxMicSlots; i++ {
		if k.MicSlots[i] == nil {
			k.MicSlots[i] = &model.MicSlot{
				Index: i, UserID: userID, UserName: userName, JoinedAt: time.Now(),
			}
			return i, true
		}
	}
	return -1, false // hết ghế — cần MIC_FULL ở tầng handler
}

// ReleaseMicByUser gỡ 1 user khỏi ghế mic của họ (tự rời hoặc bị host kick).
func (k *KTVState) ReleaseMicByUser(userID string) (int, bool) {
	k.mu.Lock()
	defer k.mu.Unlock()
	for i, s := range k.MicSlots {
		if s != nil && s.UserID == userID {
			k.MicSlots[i] = nil
			return i, true
		}
	}
	return -1, false
}

func (k *KTVState) SetCamera(userID string, on bool) (int, bool) {
	k.mu.Lock()
	defer k.mu.Unlock()
	for i, s := range k.MicSlots {
		if s != nil && s.UserID == userID {
			s.CameraOn = on
			return i, true
		}
	}
	return -1, false
}

func (k *KTVState) SetSpeaking(userID string, speaking bool) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	for _, s := range k.MicSlots {
		if s != nil && s.UserID == userID {
			s.IsSpeaking = speaking
			return true
		}
	}
	return false
}

// AddSlotGiftScore cộng điểm quà cho ghế mic tương ứng userID (hiển thị badge quà trên card).
func (k *KTVState) AddSlotGiftScore(userID string, score int) {
	k.mu.Lock()
	defer k.mu.Unlock()
	for _, s := range k.MicSlots {
		if s != nil && s.UserID == userID {
			s.GiftScore += score
			return
		}
	}
}

// IsOnMic kiểm tra user hiện có đang giữ 1 trong 6 ghế không.
func (k *KTVState) IsOnMic(userID string) bool {
	k.mu.RLock()
	defer k.mu.RUnlock()
	for _, s := range k.MicSlots {
		if s != nil && s.UserID == userID {
			return true
		}
	}
	return false
}

// GetMicSlots trả về snapshot 6 phần tử, phần tử nil = ghế trống (JSON: null).
func (k *KTVState) GetMicSlots() [model.MaxMicSlots]*model.MicSlot {
	k.mu.RLock()
	defer k.mu.RUnlock()
	var cp [model.MaxMicSlots]*model.MicSlot
	for i, s := range k.MicSlots {
		if s != nil {
			v := *s
			cp[i] = &v
		}
	}
	return cp
}

// ─── Room Mode ────────────────────────────────────────────────────────────────

func (k *KTVState) SetMode(mode model.RoomMode) {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.Mode = mode
}

func (k *KTVState) GetMode() model.RoomMode {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.Mode
}

// ─── Performance & Room Memory ─────────────────────────────────────────────────

func (k *KTVState) StartPerformance(singerID, singerName, songTitle, songArtist, lyrics, albumCoverURL string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.CurrentPerformance = &model.Performance{
		SingerID: singerID, SingerName: singerName,
		SongTitle: songTitle, SongArtist: songArtist,
		Lyrics: lyrics, AlbumCoverURL: albumCoverURL,
		StartedAt: time.Now(),
	}
	k.Mode = model.ModePerformance
}

func (k *KTVState) AddPerformanceLike() int {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.CurrentPerformance == nil {
		return 0
	}
	k.CurrentPerformance.Likes++
	return k.CurrentPerformance.Likes
}

func (k *KTVState) AddPerformanceGift(score int) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.CurrentPerformance != nil {
		k.CurrentPerformance.GiftScore += score
	}
}

func (k *KTVState) GetCurrentPerformance() *model.Performance {
	k.mu.RLock()
	defer k.mu.RUnlock()
	if k.CurrentPerformance == nil {
		return nil
	}
	cp := *k.CurrentPerformance
	return &cp
}

// EndPerformance chốt buổi trình diễn hiện tại, lưu vào Room Memory.
// audienceCount do handler truyền vào (đếm từ room.Clients tại thời điểm gọi).
func (k *KTVState) EndPerformance(audienceCount int) *model.RoomMemoryEntry {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.CurrentPerformance == nil {
		return nil
	}
	p := k.CurrentPerformance
	entry := model.RoomMemoryEntry{
		SongTitle: p.SongTitle, SongArtist: p.SongArtist,
		SingerID: p.SingerID, SingerName: p.SingerName,
		DurationSec:   int(time.Since(p.StartedAt).Seconds()),
		Likes:         p.Likes,
		GiftScore:     p.GiftScore,
		AudienceCount: audienceCount,
		Timestamp:     time.Now(),
	}
	k.Memory = append(k.Memory, entry)
	k.CurrentPerformance = nil
	return &entry
}

func (k *KTVState) GetMemory() []model.RoomMemoryEntry {
	k.mu.RLock()
	defer k.mu.RUnlock()
	cp := make([]model.RoomMemoryEntry, len(k.Memory))
	copy(cp, k.Memory)
	return cp
}

// ResetMemory gọi khi phòng đóng (5s sau khi trống — hook trong hub.go).
func (k *KTVState) ResetMemory() {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.Memory = nil
	k.PKWins = make(map[string]int)
	k.PKWinNames = make(map[string]string)
}

func (k *KTVState) RecordPKWin(userID, userName string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if userID == "" {
		return
	}
	k.PKWins[userID]++
	k.PKWinNames[userID] = userName
}

// GetTopSingers gộp Memory + PKWins theo userID, KHÔNG sắp xếp — handler tự
// chọn "most songs" / "most gifts" / "most likes" / "most PK wins" từ list này.
func (k *KTVState) GetTopSingers() []model.TopSingerStats {
	k.mu.RLock()
	defer k.mu.RUnlock()

	stats := make(map[string]*model.TopSingerStats)
	get := func(uid, name string) *model.TopSingerStats {
		if s, ok := stats[uid]; ok {
			return s
		}
		s := &model.TopSingerStats{UserID: uid, UserName: name}
		stats[uid] = s
		return s
	}

	for _, m := range k.Memory {
		s := get(m.SingerID, m.SingerName)
		s.SongsSung++
		s.TotalGifts += m.GiftScore
		s.TotalLikes += m.Likes
	}
	for uid, wins := range k.PKWins {
		s := get(uid, k.PKWinNames[uid])
		s.PKWins = wins
	}

	out := make([]model.TopSingerStats, 0, len(stats))
	for _, s := range stats {
		out = append(out, *s)
	}
	return out
}

// ─── PK ───────────────────────────────────────────────────────────────────────

func (k *KTVState) StartPK(battle *model.PKBattle) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActivePK != nil && !k.ActivePK.Done {
		return false
	}
	k.ActivePK = battle
	k.Mode = model.ModePK
	return true
}

func (k *KTVState) AddManualVote(voterID, side string) (bool, *model.PKBattle) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActivePK == nil || k.ActivePK.Done {
		return false, nil
	}
	ok := k.ActivePK.AddManualVote(voterID, side)
	return ok, k.ActivePK
}

func (k *KTVState) AddGiftVote(toUserID, fromUserID string, score int) *model.PKBattle {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActivePK == nil || k.ActivePK.Done {
		return nil
	}
	pk := k.ActivePK

	var side string
	if toUserID == pk.ChallengerID {
		side = "challenger"
	} else if toUserID == pk.OpponentID {
		side = "opponent"
	} else {
		return nil
	}

	pk.AddGiftVote(fromUserID, side, score)
	return pk
}

// EndPK chốt trận đấu. Mode trở lại Performance nếu vẫn còn người giữ mic,
// ngược lại về Lounge — quyết định thực hiện ở tầng handler (cần biết
// MicSlots hiện tại) để tránh deadlock lock kép.
func (k *KTVState) EndPK() *model.PKBattle {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActivePK == nil {
		return nil
	}
	k.ActivePK.Resolve()
	battle := k.ActivePK
	k.ActivePK = nil
	return battle
}

func (k *KTVState) GetActivePKSnapshot() *model.PKBattle {
	k.mu.RLock()
	defer k.mu.RUnlock()
	if k.ActivePK == nil {
		return nil
	}
	cp := *k.ActivePK
	return &cp
}

func (k *KTVState) GetPKSide(userID string) string {
	k.mu.RLock()
	defer k.mu.RUnlock()
	if k.ActivePK == nil || k.ActivePK.Done {
		return ""
	}
	if userID == k.ActivePK.ChallengerID {
		return "challenger"
	}
	if userID == k.ActivePK.OpponentID {
		return "opponent"
	}
	return ""
}

// HasAnyMicOccupied — dùng để quyết định Mode quay lại Lounge hay Performance sau PK.
func (k *KTVState) HasAnyMicOccupied() bool {
	k.mu.RLock()
	defer k.mu.RUnlock()
	for _, s := range k.MicSlots {
		if s != nil {
			return true
		}
	}
	return false
}