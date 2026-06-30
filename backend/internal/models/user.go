package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// User lưu thông tin người dùng đã từng tham gia
type User struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"  json:"id"`
	UserID    string             `bson:"userId"         json:"userId"`   
	UserName  string             `bson:"userName"       json:"userName"`
	CreatedAt time.Time          `bson:"createdAt"      json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt"      json:"updatedAt"`
}