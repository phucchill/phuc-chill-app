package websocket

import (
	"sync"
	"time"

	model "music-room/internal/models"
)

// KTVState lưu trạng thái KTV in-memory cho một phòng.
type KTVState struct {
	mu sync.RWMutex

	Queue         []model.SongQueueItem
	MicRequests   []model.MicRequest
	ActiveMicUID  string
	ActiveMicName string
	ActivePK      *model.PKBattle
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

// ─── Mic ──────────────────────────────────────────────────────────────────────

func (k *KTVState) AddMicRequest(req model.MicRequest) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActiveMicUID == req.UserID {
		return false
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

func (k *KTVState) ApproveMic(userID, userName string) bool {
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
		return false
	}
	k.MicRequests = newList
	k.ActiveMicUID = userID
	k.ActiveMicName = userName
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

func (k *KTVState) ReleaseMic() (prevUID string) {
	k.mu.Lock()
	defer k.mu.Unlock()
	prevUID = k.ActiveMicUID
	k.ActiveMicUID = ""
	k.ActiveMicName = ""
	return
}

func (k *KTVState) GetMicRequests() []model.MicRequest {
	k.mu.RLock()
	defer k.mu.RUnlock()
	cp := make([]model.MicRequest, len(k.MicRequests))
	copy(cp, k.MicRequests)
	return cp
}

// ─── PK ───────────────────────────────────────────────────────────────────────

func (k *KTVState) StartPK(battle *model.PKBattle) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActivePK != nil && !k.ActivePK.Done {
		return false
	}
	k.ActivePK = battle
	return true
}

// AddManualVote vote tay — mỗi user 1 lần
func (k *KTVState) AddManualVote(voterID, side string) (bool, *model.PKBattle) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.ActivePK == nil || k.ActivePK.Done {
		return false, nil
	}
	ok := k.ActivePK.AddManualVote(voterID, side)
	return ok, k.ActivePK
}

// AddGiftVote vote quà — không giới hạn, trả về PKBattle hiện tại
// Trả về nil nếu không có PK hoặc toUserId không thuộc PK
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
		// Người nhận quà không tham gia PK → không cộng điểm
		return nil
	}

	pk.AddGiftVote(fromUserID, side, score)
	return pk
}

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

// GetPKSide trả về "challenger"/"opponent"/"" cho một userID
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