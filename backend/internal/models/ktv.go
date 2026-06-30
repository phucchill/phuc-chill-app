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
	VoteType  string `bson:"voteType"  json:"voteType"`  // "manual" | "gift"
	VoteScore int    `bson:"voteScore" json:"voteScore"`
}

type PKBattle struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"       json:"id"`
	RoomID         string             `bson:"roomId"              json:"roomId"`
	ChallengerID   string             `bson:"challengerId"        json:"challengerId"`
	ChallengerName string             `bson:"challengerName"      json:"challengerName"`
	OpponentID     string             `bson:"opponentId"          json:"opponentId"`
	OpponentName   string             `bson:"opponentName"        json:"opponentName"`

	// Tổng điểm hiển thị (vote tay + quà)
	ChallengerScore int `bson:"challengerScore" json:"challengerScore"`
	OpponentScore   int `bson:"opponentScore"   json:"opponentScore"`

	// Thống kê tách riêng
	ChallengerGiftScore int `bson:"challengerGiftScore" json:"challengerGiftScore"`
	OpponentGiftScore   int `bson:"opponentGiftScore"   json:"opponentGiftScore"`
	ChallengerVoteCount int `bson:"challengerVoteCount" json:"challengerVoteCount"`
	OpponentVoteCount   int `bson:"opponentVoteCount"   json:"opponentVoteCount"`

	Votes      []PKVote `bson:"votes"      json:"votes"`
	VotedUsers []string `bson:"votedUsers" json:"votedUsers"` // chỉ track vote tay

	WinnerID   string `bson:"winnerId"   json:"winnerId"`
	WinnerName string `bson:"winnerName" json:"winnerName"`

	StartedAt time.Time  `bson:"startedAt"           json:"startedAt"`
	EndsAt    time.Time  `bson:"endsAt"              json:"endsAt"`
	EndedAt   *time.Time `bson:"endedAt"             json:"endedAt,omitempty"`
	Done      bool       `bson:"done"                json:"done"`
}

// HasVoted kiểm tra user đã vote tay chưa (vote quà không giới hạn)
func (pk *PKBattle) HasVoted(voterID string) bool {
	for _, uid := range pk.VotedUsers {
		if uid == voterID {
			return true
		}
	}
	return false
}

// AddManualVote 1 vote tay, mỗi user chỉ được 1 lần
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

// AddGiftVote cộng điểm quà, không giới hạn số lần
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

// Resolve tính winner theo tổng score
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