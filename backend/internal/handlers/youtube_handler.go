// internal/handlers/youtube_handler.go
//
// Handler cho POST /api/youtube/preview — nhận 1 URL YouTube, trả về metadata
// (title, channel, thumbnail) để frontend hiển thị SongPreviewCard.
//
// LƯU Ý QUAN TRỌNG VỀ DURATION:
//   Endpoint này dùng YouTube oEmbed (https://www.youtube.com/oembed) — public,
//   KHÔNG cần API key, nhưng oEmbed KHÔNG trả về duration của video.
//   Nếu bạn cần duration chính xác, có 2 lựa chọn:
//     1) Dùng YouTube Data API v3 (cần API key, có quota) — endpoint
//        videos?part=contentDetails&id={videoId}&key={API_KEY}, parse
//        ISO-8601 duration (PT#M#S).
//     2) Dùng yt-dlp làm subprocess trên server (nặng hơn, không cần key).
//   Mình để duration = 0 (frontend sẽ hiện "--:--") cho tới khi bạn quyết
//   định phương án nào — báo mình biết bạn có API key YouTube Data API
//   sẵn không, mình sẽ bổ sung ngay.

package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"time"
)

var youtubeIDPattern = regexp.MustCompile(
	`(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})`,
)

type youtubePreviewRequest struct {
	URL string `json:"url"`
}

type YoutubePreviewResponse struct {
	VideoID   string  `json:"videoId"`
	URL       string  `json:"url"`
	Title     string  `json:"title"`
	Channel   string  `json:"channel"`
	Thumbnail string  `json:"thumbnail"`
	Duration  float64 `json:"duration,omitempty"`
}

type oembedResponse struct {
	Title        string `json:"title"`
	AuthorName   string `json:"author_name"`
	ThumbnailURL string `json:"thumbnail_url"`
}

type youtubeErrorResponse struct {
	Error string `json:"error"`
}

func writeYoutubeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(youtubeErrorResponse{Error: message})
}

func extractYoutubeVideoID(rawURL string) string {
	match := youtubeIDPattern.FindStringSubmatch(rawURL)
	if len(match) < 2 {
		return ""
	}
	return match[1]
}

// NewYoutubePreviewHandler tạo handler cho POST /api/youtube/preview.
func NewYoutubePreviewHandler() http.HandlerFunc {
	client := &http.Client{Timeout: 8 * time.Second}

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeYoutubeError(w, http.StatusMethodNotAllowed, "Method không được hỗ trợ")
			return
		}

		var body youtubePreviewRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeYoutubeError(w, http.StatusBadRequest, "Body JSON không hợp lệ")
			return
		}

		videoID := extractYoutubeVideoID(body.URL)
		if videoID == "" {
			writeYoutubeError(w, http.StatusBadRequest, "Link YouTube không hợp lệ")
			return
		}

		watchURL := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
		oembedURL := "https://www.youtube.com/oembed?url=" + url.QueryEscape(watchURL) + "&format=json"

		resp, err := client.Get(oembedURL)
		if err != nil {
			writeYoutubeError(w, http.StatusBadGateway, "Không thể kết nối tới YouTube")
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNotFound {
			writeYoutubeError(w, http.StatusNotFound, "Video không tồn tại hoặc đã bị gỡ")
			return
		}
		if resp.StatusCode != http.StatusOK {
			writeYoutubeError(w, http.StatusBadGateway, "YouTube trả về lỗi khi lấy metadata")
			return
		}

		var oembed oembedResponse
		if err := json.NewDecoder(resp.Body).Decode(&oembed); err != nil {
			writeYoutubeError(w, http.StatusBadGateway, "Không thể đọc metadata từ YouTube")
			return
		}

		// Fallback thumbnail chất lượng cao nếu oEmbed không trả về
		thumbnail := oembed.ThumbnailURL
		if thumbnail == "" {
			thumbnail = fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", videoID)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(YoutubePreviewResponse{
			VideoID:   videoID,
			URL:       watchURL,
			Title:     oembed.Title,
			Channel:   oembed.AuthorName,
			Thumbnail: thumbnail,
			Duration:  0,
		})
	}
}