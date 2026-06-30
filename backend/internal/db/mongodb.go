package db

import (
	"context"
	"log"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	client *mongo.Client
	once   sync.Once
)

// Connect khởi tạo MongoDB client (chỉ gọi 1 lần)
func Connect(uri string) *mongo.Client {
	once.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		opts := options.Client().ApplyURI(uri)

		c, err := mongo.Connect(ctx, opts)
		if err != nil {
			log.Fatalf("[MongoDB] Kết nối thất bại: %v", err)
		}

		if err := c.Ping(ctx, nil); err != nil {
			log.Fatalf("[MongoDB] Ping thất bại: %v", err)
		}

		client = c
		log.Println("[MongoDB] Kết nối thành công")
	})

	return client
}

// GetClient trả về client đã khởi tạo (phải gọi Connect trước)
func GetClient() *mongo.Client {
	if client == nil {
		log.Fatal("[MongoDB] Chưa gọi Connect()")
	}
	return client
}

// Disconnect đóng kết nối khi shutdown
func Disconnect() {
	if client == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Disconnect(ctx); err != nil {
		log.Printf("[MongoDB] Disconnect lỗi: %v", err)
		return
	}

	log.Println("[MongoDB] Đã ngắt kết nối")
}