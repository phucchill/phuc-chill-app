# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ChillChill** — a real-time collaborative music room and KTV (karaoke) web app. Users create rooms, invite others, and listen to music or do karaoke together with synchronized playback. Two room types: **Music Room** (shared playlist/queue) and **KTV Room** (karaoke with mic requests, gifts, PK battles).

## Development Commands

### Backend (Go)
```bash
cd backend
go run cmd/api/main.go          # Start API server (port 8080)
go build -o server cmd/api/main.go  # Build binary
go vet ./...                    # Lint
go test ./...                   # Run tests
```

### Frontend (Next.js)
```bash
cd frontend
npm install                     # Install dependencies
npm run dev                     # Dev server (port 3000)
npm run build                   # Production build
npm run lint                    # ESLint
```

### Prerequisites
- MongoDB running on `localhost:27017` (database: `phuc_chill`)
- Backend `.env` is already committed with dev defaults
- Both servers must run simultaneously — frontend proxies `/api/*` and `/ws` to backend via Next.js rewrites

## Architecture

### Two-Process Setup
- **Backend** (`backend/`): Go 1.22, standard library `net/http` router, gorilla/websocket, MongoDB driver. No framework.
- **Frontend** (`frontend/`): Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.
- Frontend proxies API and WebSocket connections to backend in dev — see `frontend/next.config.ts` rewrites.

### Backend Structure
- `cmd/api/main.go` — entry point, route registration, CORS middleware
- `internal/config/` — env loading (PORT, MONGO_URI, MONGO_DB, ALLOW_ORIGIN, JWT_SECRET)
- `internal/db/` — MongoDB singleton connection (`sync.Once`)
- `internal/handlers/` — REST handlers (rooms CRUD, file upload, YouTube preview)
- `internal/models/` — data models (Room, ChatMessage, User, KTV types)
- `internal/repository/` — MongoDB CRUD (rooms, messages, gifts, pk_battles collections)
- `internal/websocket/` — Hub/Client architecture, all real-time message handling

### WebSocket Architecture
Central **Hub** pattern with a single-goroutine event loop (`hub.go`). Each WebSocket client runs two goroutines: `ReadPump` (client→hub) and `WritePump` (hub→client).

- `hub.go` — Hub event loop, Room struct, in-memory room state, core message routing
- `client.go` — Client struct with allowed message types for read/write pumps
- `queue_handler.go` + `queue_state.go` — Music Room queue logic (request/approve/reject, next/prev, history stack)
- `ktv_handler.go` + `ktv_state.go` — KTV features (song queue, mic management, gifts, PK battles)
- `playback_handler.go` — Shuffle/repeat/like toggles

Room state is **in-memory** (not persisted between restarts). Only room metadata, chat messages, and KTV events are saved to MongoDB.

Host-only actions are enforced server-side (SYNC_*, JOIN_APPROVE/REJECT, END_ROOM, PERMISSIONS_UPDATE, PLAYER_NEXT/PREV, etc.).

### Frontend Structure
- `app/page.tsx` — Home/lobby (room creation + join)
- `app/rooms/page.tsx` — Room listing
- `app/room/[roomId]/page.tsx` — Music Room page
- `app/ktv/[roomId]/page.tsx` — KTV Room page
- `room/` — Music Room sub-components (ChatBox, MusicPlayer, PlaylistQueue, SongPicker, AddSongDialog, etc.)
- `hooks/useRoomSocket.ts` — **Core hook**: manages WebSocket connection, room state, all message sending/receiving, playback sync, queue operations
- `hooks/useUpload.ts` / `hooks/useYoutube.ts` — File upload and YouTube preview logic
- `lib/socket.ts` — WebSocket factory (`createSocket`)
- `lib/musicAPI.ts` — Static song library (hardcoded array of Vietnamese songs served from `/Assets/songs/`)
- `types/websocket.ts` — All WebSocket message type constants and TypeScript interfaces
- `components/ui/` — Reusable UI primitives (Button, Modal, Slider, Toggle)

### Communication Flow
1. **REST**: Room CRUD, file uploads (`POST /api/upload`, max 50MB), YouTube metadata (`POST /api/youtube/preview`)
2. **WebSocket**: Connect via `/ws?roomId=X&userId=Y&userName=Z&roomType=music|ktv&privacy=public|private`. All real-time features: playback sync, chat, queue management, permissions, KTV mic/gift/PK.
3. Messages are JSON: `{ type, roomId, senderId, timestamp, payload }`

### User Identity
Stored in `localStorage` (`userId`, `userName`). New users get `crypto.randomUUID()`. No authentication system yet (JWT secret exists in config but isn't used in handlers).

## Key Conventions

- Path alias `@/*` maps to `frontend/*` root (tsconfig paths)
- Next.js 16 has breaking changes vs training data — check `node_modules/next/dist/docs/` before using unfamiliar Next.js APIs
- Styling uses Tailwind CSS v4 (PostCSS plugin, not the older `tailwind.config.js` approach)
- Static music assets live in `frontend/public/Assets/songs/` and `frontend/public/Assets/Images/`
- Uploaded files are stored in `backend/uploads/` and served at `/uploads/{file}`
- Private rooms require host approval; auto-close after 5 seconds when empty
