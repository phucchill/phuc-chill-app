package repository

import (
	"context"
	"time"

	model "music-room/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type KTVRepo struct {
	gifts *mongo.Collection
	pks   *mongo.Collection
}

func NewKTVRepo(db *mongo.Database) *KTVRepo {
	return &KTVRepo{
		gifts: db.Collection("gifts"),
		pks:   db.Collection("pk_battles"),
	}
}

// ─── Gift ─────────────────────────────────────────────────────────────────────

// SaveGift lưu sự kiện tặng quà vào MongoDB.
func (r *KTVRepo) SaveGift(ctx context.Context, gift *model.GiftEvent) error {
	if gift.ID.IsZero() {
		gift.ID = primitive.NewObjectID()
	}
	if gift.CreatedAt.IsZero() {
		gift.CreatedAt = time.Now()
	}

	_, err := r.gifts.InsertOne(ctx, gift)
	return err
}

// GetGiftHistory lấy lịch sử quà của phòng, mới nhất trước.
// limit = 0 → lấy 50 bản ghi gần nhất.
func (r *KTVRepo) GetGiftHistory(ctx context.Context, roomID string, limit int64) ([]model.GiftEvent, error) {
	if limit <= 0 {
		limit = 50
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(limit)

	cursor, err := r.gifts.Find(ctx, bson.M{"roomId": roomID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var gifts []model.GiftEvent
	if err := cursor.All(ctx, &gifts); err != nil {
		return nil, err
	}
	return gifts, nil
}

// GetGiftLeaderboard tổng hợp quà theo người nhận trong phòng.
// Trả về slice map[toUserId → totalGifts].
func (r *KTVRepo) GetGiftLeaderboard(ctx context.Context, roomID string) ([]bson.M, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"roomId": roomID}}},
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$toUserId"},
			{Key: "toUserName", Value: bson.M{"$last": "$toUserName"}},
			{Key: "totalGifts", Value: bson.M{"$sum": "$quantity"}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "totalGifts", Value: -1}}}},
		{{Key: "$limit", Value: 10}},
	}

	cursor, err := r.gifts.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}
	return results, nil
}

// ─── PK Battle ────────────────────────────────────────────────────────────────

// SavePKResult lưu kết quả trận PK vào MongoDB.
func (r *KTVRepo) SavePKResult(ctx context.Context, battle *model.PKBattle) error {
	if battle.ID.IsZero() {
		battle.ID = primitive.NewObjectID()
	}
	if battle.StartedAt.IsZero() {
		battle.StartedAt = time.Now()
	}

	_, err := r.pks.InsertOne(ctx, battle)
	return err
}

// GetPKHistory lấy lịch sử PK của phòng, mới nhất trước.
func (r *KTVRepo) GetPKHistory(ctx context.Context, roomID string, limit int64) ([]model.PKBattle, error) {
	if limit <= 0 {
		limit = 20
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "startedAt", Value: -1}}).
		SetLimit(limit)

	cursor, err := r.pks.Find(ctx, bson.M{"roomId": roomID, "done": true}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var battles []model.PKBattle
	if err := cursor.All(ctx, &battles); err != nil {
		return nil, err
	}
	return battles, nil
}

// GetPKWinLeaderboard tổng hợp số lần thắng PK theo user trong phòng.
func (r *KTVRepo) GetPKWinLeaderboard(ctx context.Context, roomID string) ([]bson.M, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"roomId": roomID, "done": true}}},
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$winnerId"},
			{Key: "winnerName", Value: bson.M{"$last": "$winnerName"}},
			{Key: "wins", Value: bson.M{"$sum": 1}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "wins", Value: -1}}}},
		{{Key: "$limit", Value: 10}},
	}

	cursor, err := r.pks.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}
	return results, nil
}