package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// RoomRecord lưu lịch sử phòng vào MongoDB
type RoomRecord struct {
	ID          primitive.ObjectID `bson:"_id,omitempty"  json:"id"`
	RoomID      string             `bson:"roomId"         json:"roomId"`
	RoomName    string             `bson:"roomName"       json:"roomName"`
	RoomType    string             `bson:"roomType"       json:"roomType"`
	Privacy     string             `bson:"privacy"        json:"privacy"`
	MaxUsers    int                `bson:"maxUsers"       json:"maxUsers"`
	HostID      string             `bson:"hostId"         json:"hostId"`
	CurrentSong string             `bson:"currentSong"    json:"currentSong"`
	IsPlaying   bool               `bson:"isPlaying"      json:"isPlaying"`
	Progress    float64            `bson:"progress"       json:"progress"`
	CreatedAt   time.Time          `bson:"createdAt"      json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt"      json:"updatedAt"`
	ClosedAt    *time.Time         `bson:"closedAt"       json:"closedAt,omitempty"`
}