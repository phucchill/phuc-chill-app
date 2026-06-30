package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	MongoURI    string
	MongoDB     string
	AllowOrigin string
	JWTSecret   string
}

var App *Config

func Load() {
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] Không tìm thấy .env, dùng biến môi trường hệ thống")
	}

	App = &Config{
		Port:        getEnv("PORT", "8080"),
		MongoURI:    getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:     getEnv("MONGO_DB", "music_room"),
		AllowOrigin: getEnv("ALLOW_ORIGIN", "http://localhost:3000"),
		JWTSecret:   getEnv("JWT_SECRET", "secret_change_me"),
	}

	log.Printf("[Config] Port=%s MongoDB=%s AllowOrigin=%s", App.Port, App.MongoDB, App.AllowOrigin)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}