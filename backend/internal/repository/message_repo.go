package repository

import (
	"context"
	"time"

	model "music-room/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MessageRepo struct {
	col *mongo.Collection
}

func NewMessageRepo(db *mongo.Database) *MessageRepo {
	return &MessageRepo{
		col: db.Collection("messages"),
	}
}

func (r *MessageRepo) Create(ctx context.Context, msg *model.ChatMessage) error {
	msg.CreatedAt = time.Now()
	_, err := r.col.InsertOne(ctx, msg)
	return err
}

func (r *MessageRepo) FindByRoomID(ctx context.Context, roomID string) ([]model.ChatMessage, error) {
	opts := options.Find().
		SetSort(bson.M{"createdAt": 1}).
		SetLimit(100)

	cursor, err := r.col.Find(ctx, bson.M{"roomId": roomID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var messages []model.ChatMessage
	err = cursor.All(ctx, &messages)
	return messages, err
}

// ✅ Xóa toàn bộ tin nhắn của phòng khi phòng trống
func (r *MessageRepo) DeleteByRoomID(ctx context.Context, roomID string) error {
	_, err := r.col.DeleteMany(ctx, bson.M{"roomId": roomID})
	return err
}