export interface Song {
  id: number;
  songName: string;
  songArtist: string;
  songSrc: string;
  songAvatar: string;
  duration: string; // "3:45"
  durationSeconds: number; // để gửi lên queue
  genre: string;
  liked: boolean;
}

const musicAPI: Song[] = [
  {
    id: 1,
    songName: "Ngày Mai Người Ta Lấy Chồng",
    songArtist: "Voi Bản Đôn",
    songSrc: "/Assets/songs/ngaymainguoitalaychong.mp3",
    songAvatar: "/Assets/Images/image1.jpg",
    duration: "3:45",
    durationSeconds: 225,
    genre: "V-Pop",
    liked: false,
  },
  {
    id: 2,
    songName: "Yêu Như Ngày Yêu Cuối",
    songArtist: "Cún Tóc Lô",
    songSrc: "/Assets/songs/yeunhungayyeucuoi.mp3",
    songAvatar: "/Assets/Images/image4.jpg",
    duration: "4:12",
    durationSeconds: 252,
    genre: "Ballad",
    liked: false,
  },
  {
    id: 3,
    songName: "Quá Khứ Còn Lại Gì",
    songArtist: "Hippo Happy",
    songSrc: "/Assets/songs/quakhuconlaigi.mp3",
    songAvatar: "/Assets/Images/image2.jpg",
    duration: "3:58",
    durationSeconds: 238,
    genre: "V-Pop",
    liked: false,
  },
  {
    id: 4,
    songName: "Lửng Lơ",
    songArtist: "Sứa Thuỷ Tinh",
    songSrc: "/Assets/songs/lunglo.mp3",
    songAvatar: "/Assets/Images/image3.jpg",
    duration: "3:30",
    durationSeconds: 210,
    genre: "Indie",
    liked: false,
  },
  {
    id: 5,
    songName: "Rời Bỏ",
    songArtist: "Voi Bản Đôn",
    songSrc: "/Assets/songs/roibo.mp3",
    songAvatar: "/Assets/Images/image6.jpg",
    duration: "4:05",
    durationSeconds: 245,
    genre: "V-Pop",
    liked: false,
  },
  {
    id: 6,
    songName: "Chân Ái",
    songArtist: "O Sen",
    songSrc: "/Assets/songs/chanai.mp3",
    songAvatar: "/Assets/Images/image5.jpg",
    duration: "3:22",
    durationSeconds: 202,
    genre: "Ballad",
    liked: false,
  },
  {
    id: 7,
    songName: "Đưa Em Tìm Động Hoa Vàng",
    songArtist: "Cú Tây Bắc",
    songSrc: "/Assets/songs/duaemtimdonghoavang.mp3",
    songAvatar: "/Assets/Images/image7.jpg",
    duration: "5:10",
    durationSeconds: 310,
    genre: "Dân Ca",
    liked: false,
  },
  {
    id: 8,
    songName: "Kiếp Nào Có Yêu Nhau",
    songArtist: "Phượng Hoàng Lửa",
    songSrc: "/Assets/songs/kiepnaocoyeunhau.mp3",
    songAvatar: "/Assets/Images/image8.jpg",
    duration: "4:33",
    durationSeconds: 273,
    genre: "Bolero",
    liked: false,
  },
  {
    id: 9,
    songName: "Anh Chưa Thương Em Đến Vậy Đâu",
    songArtist: "Lady Mây",
    songSrc: "/Assets/songs/anhchuathuongemdenvaydau.mp3",
    songAvatar: "/Assets/Images/image9.jpg",
    duration: "3:47",
    durationSeconds: 227,
    genre: "Ballad",
    liked: false,
  },
  {
    id: 10,
    songName: "Bước Qua Mùa Cô Đơn",
    songArtist: "Báo Mắt Biếc",
    songSrc: "/Assets/songs/buocquamuacodon.mp3",
    songAvatar: "/Assets/Images/image10.jpg",
    duration: "4:20",
    durationSeconds: 260,
    genre: "V-Pop",
    liked: false,
  },
];

export default musicAPI;

// Helper: tìm bài theo songSrc (để MusicPlayer hiện đúng tên/ảnh)
export function findSongBySrc(src: string): Song | undefined {
  return musicAPI.find((s) => s.songSrc === src || src.endsWith(s.songSrc));
}