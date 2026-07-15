package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ─── Role ─────────────────────────────────────────────────────────────────────

type Role string

const (
	RoleHost   Role = "host"
	RoleMic    Role = "mic"
	RoleViewer Role = "viewer"
)

// ─── Room Mode ────────────────────────────────────────────────────────────────

type RoomMode string

const (
	ModeLounge      RoomMode = "lounge"      // Mặc định — nghe nhạc cùng nhau, chưa ai hát
	ModePerformance RoomMode = "performance" // Có người đang được spotlight trình diễn
	ModePK          RoomMode = "pk"          // Đang diễn ra trận PK
)

// GiftCost giá trị vote của từng loại quà
var GiftCost = map[string]int{
	"rose":    10,
	"heart":   20,
	"crown":   50,
	"diamond": 100,
	"rocket":  200,
	"trophy":  500,
}

// ─── Song Queue ───────────────────────────────────────────────────────────────

type SongQueueItem struct {
	ID              string    `bson:"id"              json:"id"`
	Title           string    `bson:"title"           json:"title"`
	Artist          string    `bson:"artist"          json:"artist"`
	SongURL         string    `bson:"songUrl"         json:"songUrl"`
	RequestedBy     string    `bson:"requestedBy"     json:"requestedBy"`
	RequestedByName string    `bson:"requestedByName" json:"requestedByName"`
	AddedAt         time.Time `bson:"addedAt"         json:"addedAt"`
}

// ─── Mic ──────────────────────────────────────────────────────────────────────

type MicRequest struct {
	UserID      string    `bson:"userId"      json:"userId"`
	UserName    string    `bson:"userName"    json:"userName"`
	RequestedAt time.Time `bson:"requestedAt" json:"requestedAt"`
}

// MicSlot đại diện 1 trong 6 ghế mic. Slot trống được biểu diễn bằng nil
// trong mảng KTVState.MicSlots (JSON marshal ra null).
type MicSlot struct {
	Index      int       `bson:"index"      json:"index"`
	UserID     string    `bson:"userId"     json:"userId"`
	UserName   string    `bson:"userName"   json:"userName"`
	CameraOn   bool      `bson:"cameraOn"   json:"cameraOn"`
	IsSpeaking bool      `bson:"isSpeaking" json:"isSpeaking"`
	GiftScore  int       `bson:"giftScore"  json:"giftScore"`
	JoinedAt   time.Time `bson:"joinedAt"   json:"joinedAt"`
}

const MaxMicSlots = 6

// ─── Gift ─────────────────────────────────────────────────────────────────────

type GiftEvent struct {
	ID           primitive.ObjectID `bson:"_id,omitempty"  json:"id"`
	RoomID       string             `bson:"roomId"         json:"roomId"`
	FromUserID   string             `bson:"fromUserId"     json:"fromUserId"`
	FromUserName string             `bson:"fromUserName"   json:"fromUserName"`
	ToUserID     string             `bson:"toUserId"       json:"toUserId"`
	ToUserName   string             `bson:"toUserName"     json:"toUserName"`
	GiftType     string             `bson:"giftType"       json:"giftType"`
	GiftEmoji    string             `bson:"giftEmoji"      json:"giftEmoji"`
	GiftName     string             `bson:"giftName"       json:"giftName"`
	GiftCost     int                `bson:"giftCost"       json:"giftCost"`
	Quantity     int                `bson:"quantity"       json:"quantity"`
	AddedToPK    bool               `bson:"addedToPK"      json:"addedToPK"`
	CreatedAt    time.Time          `bson:"createdAt"      json:"createdAt"`
}

// ─── PK Battle ────────────────────────────────────────────────────────────────

type PKVote struct {
	VoterID   string `bson:"voterId"   json:"voterId"`
	Side      string `bson:"side"      json:"side"`
	VoteType  string `bson:"voteType"  json:"voteType"` // "manual" | "gift"
	VoteScore int    `bson:"voteScore" json:"voteScore"`
}

type PKBattle struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"       json:"id"`
	RoomID         string             `bson:"roomId"              json:"roomId"`
	ChallengerID   string             `bson:"challengerId"        json:"challengerId"`
	ChallengerName string             `bson:"challengerName"      json:"challengerName"`
	OpponentID     string             `bson:"opponentId"          json:"opponentId"`
	OpponentName   string             `bson:"opponentName"        json:"opponentName"`

	ChallengerScore int `bson:"challengerScore" json:"challengerScore"`
	OpponentScore   int `bson:"opponentScore"   json:"opponentScore"`

	ChallengerGiftScore int `bson:"challengerGiftScore" json:"challengerGiftScore"`
	OpponentGiftScore   int `bson:"opponentGiftScore"   json:"opponentGiftScore"`
	ChallengerVoteCount int `bson:"challengerVoteCount" json:"challengerVoteCount"`
	OpponentVoteCount   int `bson:"opponentVoteCount"   json:"opponentVoteCount"`

	Votes      []PKVote `bson:"votes"      json:"votes"`
	VotedUsers []string `bson:"votedUsers" json:"votedUsers"`

	WinnerID   string `bson:"winnerId"   json:"winnerId"`
	WinnerName string `bson:"winnerName" json:"winnerName"`

	StartedAt time.Time  `bson:"startedAt"           json:"startedAt"`
	EndsAt    time.Time  `bson:"endsAt"              json:"endsAt"`
	EndedAt   *time.Time `bson:"endedAt"             json:"endedAt,omitempty"`
	Done      bool       `bson:"done"                json:"done"`
}

func (pk *PKBattle) HasVoted(voterID string) bool {
	for _, uid := range pk.VotedUsers {
		if uid == voterID {
			return true
		}
	}
	return false
}

func (pk *PKBattle) AddManualVote(voterID, side string) bool {
	if pk.HasVoted(voterID) {
		return false
	}
	pk.VotedUsers = append(pk.VotedUsers, voterID)
	pk.Votes = append(pk.Votes, PKVote{
		VoterID: voterID, Side: side, VoteType: "manual", VoteScore: 1,
	})
	if side == "challenger" {
		pk.ChallengerScore++
		pk.ChallengerVoteCount++
	} else {
		pk.OpponentScore++
		pk.OpponentVoteCount++
	}
	return true
}

func (pk *PKBattle) AddGiftVote(fromUserID, side string, score int) {
	pk.Votes = append(pk.Votes, PKVote{
		VoterID: fromUserID, Side: side, VoteType: "gift", VoteScore: score,
	})
	if side == "challenger" {
		pk.ChallengerScore += score
		pk.ChallengerGiftScore += score
	} else {
		pk.OpponentScore += score
		pk.OpponentGiftScore += score
	}
}

func (pk *PKBattle) Resolve() {
	now := time.Now()
	pk.EndedAt = &now
	pk.Done = true
	if pk.ChallengerScore >= pk.OpponentScore {
		pk.WinnerID = pk.ChallengerID
		pk.WinnerName = pk.ChallengerName
	} else {
		pk.WinnerID = pk.OpponentID
		pk.WinnerName = pk.OpponentName
	}
}

// ─── Performance & Room Memory ─────────────────────────────────────────────────

// Performance là buổi trình diễn đang diễn ra (1 người được spotlight).
type Performance struct {
	SingerID   string    `json:"singerId"`
	SingerName string    `json:"singerName"`
	SongTitle  string    `json:"songTitle"`
	SongArtist string    `json:"songArtist"`
	Lyrics        string    `json:"lyrics,omitempty"`        // MỚI
	AlbumCoverURL string    `json:"albumCoverUrl,omitempty"` // MỚI
	StartedAt  time.Time `json:"startedAt"`
	Likes      int       `json:"likes"`
	GiftScore  int       `json:"giftScore"`
}

// RoomMemoryEntry lưu lại 1 màn trình diễn đã kết thúc trong phiên phòng.
// Reset hoàn toàn khi phòng đóng (không persist Mongo — đúng như yêu cầu).
type RoomMemoryEntry struct {
	SongTitle     string    `json:"songTitle"`
	SongArtist    string    `json:"songArtist"`
	SingerID      string    `json:"singerId"`
	SingerName    string    `json:"singerName"`
	DurationSec   int       `json:"durationSec"`
	Likes         int       `json:"likes"`
	GiftScore     int       `json:"giftScore"`
	AudienceCount int       `json:"audienceCount"`
	Timestamp     time.Time `json:"timestamp"`
}

// TopSingerStats — thống kê chỉ trong phạm vi phòng hiện tại (không global).
type TopSingerStats struct {
	UserID     string `json:"userId"`
	UserName   string `json:"userName"`
	SongsSung  int    `json:"songsSung"`
	TotalGifts int    `json:"totalGifts"`
	TotalLikes int    `json:"totalLikes"`
	PKWins     int    `json:"pkWins"`
}
// ─── Reaction ─────────────────────────────────────────────────────────────────
// Danh sách emoji hợp lệ — validate ở handler để chặn payload rác.
var ValidReactions = map[string]bool{
	"🔥": true, "😍": true, "👏": true, "😂": true, "❤️": true,
}