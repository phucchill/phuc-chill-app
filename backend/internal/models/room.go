package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// RoomPermissions cấu hình quyền thêm bài hát trong phòng — Host chỉnh trong
// Room Settings. Dùng chung giữa Room (runtime, xem websocket/hub.go) và
// RoomRecord (persistence, Mongo) để tránh định nghĩa 2 lần.
type RoomPermissions struct {
	OnlyHostCanAdd     bool `bson:"onlyHostCanAdd"     json:"onlyHostCanAdd"`
	MembersCanUpload   bool `bson:"membersCanUpload"   json:"membersCanUpload"`
	MembersCanYoutube  bool `bson:"membersCanYoutube"  json:"membersCanYoutube"`
	MembersCanSearch   bool `bson:"membersCanSearch"   json:"membersCanSearch"`
	AutoApproveUploads bool `bson:"autoApproveUploads" json:"autoApproveUploads"`
}

// DefaultRoomPermissions trả về quyền mặc định khi phòng vừa được tạo —
// khớp với DEFAULT_ROOM_PERMISSIONS ở frontend/types/upload.ts.
func DefaultRoomPermissions() RoomPermissions {
	return RoomPermissions{
		OnlyHostCanAdd:     false,
		MembersCanUpload:   true,
		MembersCanYoutube:  true,
		MembersCanSearch:   true,
		AutoApproveUploads: false,
	}
}

// IsZero báo true nếu tất cả field đều là giá trị mặc định của Go (false).
// Dùng để phân biệt "phòng này chưa từng lưu Permissions" (tài liệu Mongo
// cũ trước khi tính năng này tồn tại) với "host cố ý tắt hết mọi quyền" —
// khi đọc từ DB mà gặp trường hợp IsZero(), Hub sẽ dùng
// DefaultRoomPermissions() thay vì tin đây là cấu hình thật.
func (p RoomPermissions) IsZero() bool {
	return p == RoomPermissions{}
}

// CanMemberAdd kiểm tra 1 THÀNH VIÊN (không phải host) có được phép thêm bài
// từ 1 nguồn cụ thể hay không. source: "library" | "upload" | "youtube".
// Host luôn được phép thêm bài bất kể cấu hình này — hàm này chỉ nên gọi khi
// người thêm KHÔNG phải host.
func (p RoomPermissions) CanMemberAdd(source string) bool {
	if p.OnlyHostCanAdd {
		return false
	}

	switch source {
	case "upload":
		return p.MembersCanUpload
	case "youtube":
		return p.MembersCanYoutube
	default: // "library" hoặc rỗng
		return p.MembersCanSearch
	}
}

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

	// Permissions hiện CHƯA được đọc/ghi bởi repository/room_repo.go (mình
	// chưa thấy file đó). Field này được thêm sẵn để bạn có thể persist
	// quyền phòng qua các lần đóng/mở lại phòng trong tương lai — hiện tại
	// Hub luôn khởi tạo Permissions = DefaultRoomPermissions() trong bộ nhớ
	// mỗi khi phòng được tạo mới (xem websocket/hub.go).
	Permissions RoomPermissions `bson:"permissions"    json:"permissions"`

	CreatedAt time.Time  `bson:"createdAt"      json:"createdAt"`
	UpdatedAt time.Time  `bson:"updatedAt"      json:"updatedAt"`
	ClosedAt  *time.Time `bson:"closedAt"       json:"closedAt,omitempty"`
}