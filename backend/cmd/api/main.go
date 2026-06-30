package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"music-room/internal/config"
	"music-room/internal/db"
	"music-room/internal/handlers"
	"music-room/internal/repository"
	ws "music-room/internal/websocket"
)

func main() {
	config.Load()
	cfg := config.App

	mongoClient := db.Connect(cfg.MongoURI)
	defer db.Disconnect()

	database := mongoClient.Database(cfg.MongoDB)

	messageRepo := repository.NewMessageRepo(database)
	roomRepo    := repository.NewRoomRepo(database)
	ktvRepo     := repository.NewKTVRepo(database) // ← KTV repo

	hub := ws.NewHub(messageRepo, roomRepo, ktvRepo) // ← truyền ktvRepo
	go hub.Run()

	roomHandler := handlers.NewRoomHandler(roomRepo, messageRepo)

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWS(hub, w, r)
	})

	// GET /rooms và POST /rooms
	mux.HandleFunc("/rooms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			roomHandler.GetRooms(w, r)
			return

		case http.MethodPost:
			roomHandler.CreateRoom(w, r)
			return

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
	})

	// GET    /rooms/{roomId}
	// GET    /rooms/{roomId}/messages
	// DELETE /rooms/{roomId}
	mux.HandleFunc("/rooms/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/rooms/")
		parts := strings.Split(path, "/")

		if len(parts) == 0 || parts[0] == "" {
			http.NotFound(w, r)
			return
		}

		roomID := parts[0]

		if len(parts) == 1 {
			switch r.Method {
			case http.MethodGet:
				roomHandler.GetRoomByID(w, r, roomID)
				return

			case http.MethodDelete:
				roomHandler.CloseRoom(w, r, roomID)
				return

			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
		}

		if len(parts) == 2 && parts[1] == "messages" {
			if r.Method != http.MethodGet {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			roomHandler.GetMessagesByRoomID(w, r, roomID)
			return
		}

		http.NotFound(w, r)
	})

	handler := corsMiddleware(cfg.AllowOrigin, mux)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("[Main] Server đang lắng nghe tại :%s", cfg.Port)

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Main] ListenAndServe lỗi: %v", err)
		}
	}()

	<-quit

	log.Println("[Main] Đang shutdown...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[Main] Shutdown lỗi: %v", err)
	}

	log.Println("[Main] Server đã dừng")
}

func corsMiddleware(allowOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if allowOrigin == "" {
			allowOrigin = "*"
		}

		w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}