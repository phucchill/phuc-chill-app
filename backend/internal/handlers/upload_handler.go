// internal/handlers/upload_handler.go
//
// Handler cho POST /api/upload — nhận file nhạc local, validate, lưu vào đĩa,
// trả về URL TUYỆT ĐỐI (absolute URL) để frontend phát trực tiếp qua
// <audio src="...">. Dùng URL tuyệt đối (không phải path tương đối) vì file
// được lưu và serve bởi backend Go, KHÔNG nằm trong frontend/public — nếu
// trả về path tương đối như "/Assets/songs/uploads/x.mp3", trình duyệt sẽ
// cố tải nó từ origin của Next.js (nơi không có file này) chứ không phải
// từ Go server.
//
// LƯU Ý TÍCH HỢP:
//   - File này viết bằng net/http thuần (http.HandlerFunc) để tương thích với
//     bất kỳ router nào (gin, chi, gorilla/mux, hoặc net/http.ServeMux).
//     Nếu bạn dùng gin, chỉ cần bọc lại:
//       router.POST("/api/upload", gin.WrapF(handlers.NewUploadHandler(uploadDir, "/uploads")))
//   - Xem cmd/api/main.go để biết cách đăng ký route + serve file tĩnh.
//   - Duration: mình lấy duration từ form field "duration" do client gửi lên
//     (đã đo bằng thẻ <audio> ở trình duyệt trước khi upload) thay vì probe
//     bằng ffprobe ở server, để tránh thêm dependency hệ thống.

package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const maxUploadSizeBytes = 50 << 20 // 50MB

var allowedUploadExtensions = map[string]bool{
	".mp3":  true,
	".wav":  true,
	".flac": true,
	".m4a":  true,
	".aac":  true,
	".ogg":  true,
}

type UploadResponse struct {
	SongSrc  string  `json:"songSrc"`
	Duration float64 `json:"duration,omitempty"`
	Title    string  `json:"title,omitempty"`
}

type uploadErrorResponse struct {
	Error string `json:"error"`
}

func writeUploadError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(uploadErrorResponse{Error: message})
}

// NewUploadHandler tạo handler cho POST /api/upload.
//
//	uploadDir:    thư mục vật lý trên đĩa để lưu file (sẽ tự tạo nếu chưa có)
//	publicPrefix: tiền tố URL public để trả về cho frontend, ví dụ "/Assets/songs/uploads"
func NewUploadHandler(uploadDir string, publicPrefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeUploadError(w, http.StatusMethodNotAllowed, "Method không được hỗ trợ")
			return
		}

		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			writeUploadError(w, http.StatusInternalServerError, "Không thể tạo thư mục lưu file")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSizeBytes+1<<20) // + buffer cho multipart overhead
		if err := r.ParseMultipartForm(maxUploadSizeBytes); err != nil {
			writeUploadError(w, http.StatusBadRequest, "File quá lớn hoặc form không hợp lệ (tối đa 50MB)")
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeUploadError(w, http.StatusBadRequest, "Thiếu file trong form-data (field 'file')")
			return
		}
		defer file.Close()

		if header.Size > maxUploadSizeBytes {
			writeUploadError(w, http.StatusBadRequest, "File vượt quá 50MB cho phép")
			return
		}

		ext := strings.ToLower(filepath.Ext(header.Filename))
		if !allowedUploadExtensions[ext] {
			writeUploadError(w, http.StatusBadRequest, fmt.Sprintf("Định dạng %s không được hỗ trợ", ext))
			return
		}

		safeName := sanitizeFileName(strings.TrimSuffix(header.Filename, ext))
		fileName := fmt.Sprintf("%s-%d%s", safeName, time.Now().UnixNano(), ext)
		destPath := filepath.Join(uploadDir, fileName)

		dest, err := os.Create(destPath)
		if err != nil {
			writeUploadError(w, http.StatusInternalServerError, "Không thể lưu file")
			return
		}
		defer dest.Close()

		if _, err := io.Copy(dest, file); err != nil {
			writeUploadError(w, http.StatusInternalServerError, "Lỗi khi ghi file")
			return
		}

		var duration float64
		if raw := r.FormValue("duration"); raw != "" {
			if parsed, err := strconv.ParseFloat(raw, 64); err == nil {
				duration = parsed
			}
		}

		title := r.FormValue("title")
		if title == "" {
			title = strings.TrimSuffix(header.Filename, ext)
		}

		publicPath := absoluteUploadURL(r, publicPrefix, fileName)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(UploadResponse{
			SongSrc:  publicPath,
			Duration: duration,
			Title:    title,
		})
	}
}

// absoluteUploadURL dựng URL tuyệt đối tới file vừa upload, dựa trên chính
// request hiện tại (Host + scheme) — không cần biết trước domain/port khi
// deploy, và tự động đúng cả khi chạy sau reverse proxy (đọc X-Forwarded-Proto).
func absoluteUploadURL(r *http.Request, publicPrefix string, fileName string) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if fwd := r.Header.Get("X-Forwarded-Proto"); fwd != "" {
		scheme = fwd
	}

	prefix := "/" + strings.Trim(publicPrefix, "/")
	return fmt.Sprintf("%s://%s%s/%s", scheme, r.Host, prefix, fileName)
}

// sanitizeFileName loại bỏ ký tự có thể gây lỗi đường dẫn / trùng lặp.
func sanitizeFileName(name string) string {
	replacer := strings.NewReplacer(
		" ", "_", "/", "-", "\\", "-", "..", "-",
		"\"", "", "'", "", ":", "-",
	)
	cleaned := replacer.Replace(name)
	if cleaned == "" {
		cleaned = "audio"
	}
	return cleaned
}

// ============================================================
// DỌN DẸP FILE UPLOAD
// ============================================================
//
// Có 2 cơ chế dọn dẹp, hoạt động độc lập và bổ trợ cho nhau:
//
// 1) StartUploadCleanupSweeper — quét định kỳ, xóa file CŨ HƠN maxAge.
//    Đây là lưới an toàn chính: đơn giản, không cần biết bài hát nào
//    "đã phát xong" (rất khó xác định chắc chắn vì còn Repeat "all" đẩy
//    bài quay lại cuối hàng chờ, hoặc Prev cần lại file cũ từ History).
//    Miễn phòng không mở liên tục hơn maxAge, file sẽ tự được dọn.
//
// 2) DeleteUploadedFile — xóa NGAY một file cụ thể theo tên. Dùng ở
//    websocket/queue_handler.go khi host CHỦ ĐỘNG xóa/từ chối 1 bài
//    upload khỏi hàng chờ (QUEUE_REMOVE/QUEUE_REJECT/QUEUE_CLEAR_PENDING)
//    — lúc đó chắc chắn không còn tham chiếu nào tới file nữa nên xóa
//    ngay được, không cần chờ sweeper.
//
// Không xóa file ngay khi bài "next" qua bài khác, vì với Repeat "all"
// hoặc Prev, file đó có thể cần dùng lại (xem playback_handler.go/
// queue_handler.go) — xóa nhầm sẽ làm hỏng phát lại.

// StartUploadCleanupSweeper chạy nền, quét uploadDir mỗi `interval`, xóa
// file có thời gian sửa đổi (ModTime) cũ hơn `maxAge`. Gọi 1 lần từ
// main.go bằng `go handlers.StartUploadCleanupSweeper(...)`.
func StartUploadCleanupSweeper(uploadDir string, maxAge time.Duration, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		sweepOldUploads(uploadDir, maxAge)
	}
}

func sweepOldUploads(uploadDir string, maxAge time.Duration) {
	entries, err := os.ReadDir(uploadDir)
	if err != nil {
		return
	}

	cutoff := time.Now().Add(-maxAge)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(uploadDir, entry.Name()))
		}
	}
}

// DeleteUploadedFile xóa 1 file cụ thể trong uploadDir theo tên (không
// phải theo URL đầy đủ). Không coi việc file không tồn tại là lỗi (có thể
// đã bị sweeper dọn từ trước).
func DeleteUploadedFile(uploadDir string, fileName string) error {
	if fileName == "" {
		return nil
	}
	err := os.Remove(filepath.Join(uploadDir, fileName))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// ExtractUploadFileName lấy tên file thật từ 1 URL upload đầy đủ, ví dụ
// "http://host:8080/uploads/ten_bai-169999.mp3" với publicPrefix="/uploads"
// trả về "ten_bai-169999.mp3". Trả về ("", false) nếu songURL không phải
// URL upload (vd bài thư viện hoặc YouTube) — QUAN TRỌNG để tránh xóa
// nhầm file không phải do hệ thống upload quản lý.
func ExtractUploadFileName(publicPrefix string, songURL string) (string, bool) {
	prefix := "/" + strings.Trim(publicPrefix, "/") + "/"

	idx := strings.Index(songURL, prefix)
	if idx == -1 {
		return "", false
	}

	fileName := songURL[idx+len(prefix):]
	if fileName == "" || strings.ContainsAny(fileName, "/\\") {
		// Có dấu "/" nghĩa là lỡ khớp nhầm 1 đoạn URL khác, không phải
		// tên file thật nằm ngay sau prefix.
		return "", false
	}

	return fileName, true
}