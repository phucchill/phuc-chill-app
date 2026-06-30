package repository

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"music-room/internal/models"
)

type RoomRepo struct {
	col *mongo.Collection
}

func NewRoomRepo(db *mongo.Database) *RoomRepo {
	return &RoomRepo{col: db.Collection("rooms")}
}

// Upsert tạo mới hoặc cập nhật record phòng với cấu trúc mapping cụ thể từng field
func (r *RoomRepo) Upsert(ctx context.Context, room *model.RoomRecord) error {
	now := time.Now()
	room.UpdatedAt = now

	filter := bson.M{"roomId": room.RoomID}

	update := bson.M{
		"$set": bson.M{
			"roomId":      room.RoomID,
			"roomName":    room.RoomName,
			"roomType":    room.RoomType,
			"privacy":     room.Privacy,
			"maxUsers":    room.MaxUsers,
			"hostId":      room.HostID,
			"currentSong": room.CurrentSong,
			"isPlaying":   room.IsPlaying,
			"progress":    room.Progress,
			"updatedAt":   now,
			"closedAt":    room.ClosedAt,
		},
		"$setOnInsert": bson.M{
			"createdAt": now,
		},
	}

	opts := options.Update().SetUpsert(true)

	_, err := r.col.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		log.Printf("[RoomRepo] Upsert lỗi roomId=%s: %v", room.RoomID, err)
	}

	return err
}

// FindByRoomID tìm phòng theo roomId
func (r *RoomRepo) FindByRoomID(ctx context.Context, roomID string) (*model.RoomRecord, error) {
	var room model.RoomRecord

	err := r.col.FindOne(ctx, bson.M{"roomId": roomID}).Decode(&room)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}

	return &room, nil
}

// MarkClosed ghi nhận thời điểm phòng đóng
func (r *RoomRepo) MarkClosed(ctx context.Context, roomID string) error {
	now := time.Now()

	_, err := r.col.UpdateOne(
		ctx,
		bson.M{"roomId": roomID},
		bson.M{"$set": bson.M{
			"closedAt":  now,
			"updatedAt": now,
		}},
	)

	if err != nil {
		log.Printf("[RoomRepo] MarkClosed lỗi roomId=%s: %v", roomID, err)
	}

	return err
}

func (r *RoomRepo) Reopen(ctx context.Context, roomID string) error {
	now := time.Now()

	_, err := r.col.UpdateOne(
		ctx,
		bson.M{"roomId": roomID},
		bson.M{
			"$unset": bson.M{
				"closedAt": "",
			},
			"$set": bson.M{
				"updatedAt": now,
			},
		},
	)

	if err != nil {
		log.Printf("[RoomRepo] Reopen lỗi roomId=%s: %v", roomID, err)
	}

	return err
}

// ListOpen lấy danh sách phòng chưa đóng (bảo vệ lỗi dữ liệu null hoặc trống trường closedAt)
func (r *RoomRepo) ListOpen(ctx context.Context) ([]*model.RoomRecord, error) {
	filter := bson.M{
		"$or": []bson.M{
			{"closedAt": bson.M{"$exists": false}},
			{"closedAt": nil},
		},
	}

	cursor, err := r.col.Find(ctx, filter)
	if err != nil {
		return []*model.RoomRecord{}, err
	}
	defer cursor.Close(ctx)

	rooms := make([]*model.RoomRecord, 0)

	if err := cursor.All(ctx, &rooms); err != nil {
		return []*model.RoomRecord{}, err
	}

	return rooms, nil
}