"use client";

import { useState } from "react";
import { ListMusic, Upload, Video } from "lucide-react";
import Modal from "../components/ui/Modal";
import SongPicker from "./SongPicker";
import UploadDropzone from "./UploadDropzone";
import UploadProgress from "./UploadProgress";
import YoutubeInput from "./YoutubeInput";
import SongMetadataForm from "./SongMetadataForm";
import { useUpload } from "../hooks/useUpload";
import {
  DEFAULT_ROOM_PERMISSIONS,
  QueueSongInput,
  RoomPermissions,
} from "../types/upload";

type AddSongTab = "search" | "upload" | "youtube";

interface AddSongDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  apiBase: string;
  currentUserName?: string;
  permissions?: RoomPermissions;
  /** Giữ nguyên hành vi request/duyệt bài hiện tại của bạn cho tab "Tìm kiếm" */
  onRequestLibrarySong: (song: {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    songSrc: string;
  }) => void;
  /** Dùng cho file upload & YouTube — đẩy thẳng vào hàng chờ với source rõ ràng */
  onAddSong: (song: QueueSongInput) => void;
}

const TABS: { key: AddSongTab; label: string; icon: typeof ListMusic }[] = [
  { key: "search", label: "Thư viện", icon: ListMusic },
  { key: "upload", label: "Tải file", icon: Upload },
  { key: "youtube", label: "YouTube", icon: Video },
];

export default function AddSongDialog({
  isOpen,
  onClose,
  isHost,
  apiBase,
  currentUserName,
  permissions = DEFAULT_ROOM_PERMISSIONS,
  onRequestLibrarySong,
  onAddSong,
}: AddSongDialogProps) {
  const [tab, setTab] = useState<AddSongTab>("search");

  // Hàng đợi các file upload xong, đang chờ người dùng xác nhận/sửa
  // metadata (Tên/Nghệ sĩ/Avatar) TRƯỚC KHI thật sự add vào hàng chờ nhạc.
  // useUpload chỉ lo validate + upload + progress; việc "add vào queue"
  // giờ bị chặn lại ở đây cho tới khi form được xác nhận.
  const [pendingReview, setPendingReview] = useState<QueueSongInput[]>([]);

  const { files, addFiles, removeFile, retryFile } = useUpload({
    apiBase,
    currentUserName,
    onUploaded: (song) => setPendingReview((prev) => [...prev, song]),
  });

  // Host-only override: nếu bật, tất cả tab bị khoá với member
  const hostOnlyLock = permissions.onlyHostCanAdd && !isHost;

  const searchLocked = hostOnlyLock || (!permissions.membersCanSearch && !isHost);
  const uploadLocked = hostOnlyLock || (!permissions.membersCanUpload && !isHost);
  const youtubeLocked = hostOnlyLock || (!permissions.membersCanYoutube && !isHost);

  const renderLockedMessage = (text: string) => (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-card border border-divider bg-white/[0.02] p-8 text-center">
      <p className="m-0 text-[13px] text-text-muted">{text}</p>
    </div>
  );

  const currentReview = pendingReview[0] ?? null;

  const handleConfirmReview = (values: { title: string; artist: string; thumbnail: string }) => {
    if (!currentReview) return;
    onAddSong({
      ...currentReview,
      title: values.title,
      artist: values.artist || undefined,
      thumbnail: values.thumbnail || currentReview.thumbnail,
    });
    setPendingReview((prev) => prev.slice(1));
  };

  const handleCancelReview = () => {
    setPendingReview((prev) => prev.slice(1));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thêm bài hát" maxWidthClassName="max-w-[560px]">
      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-input border border-divider bg-black/20 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-button border-none px-2 py-2 text-[13px] transition-colors ${
              tab === key
                ? "bg-key font-medium text-white"
                : "bg-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      {tab === "search" &&
        (searchLocked ? (
          renderLockedMessage("Host đã tắt tính năng tìm kiếm thư viện cho thành viên.")
        ) : (
          <SongPicker isHost={isHost} onRequest={onRequestLibrarySong} />
        ))}

      {tab === "upload" &&
        (uploadLocked ? (
          renderLockedMessage("Host đã tắt tính năng tải file cho thành viên.")
        ) : (
          <div className="flex flex-col gap-4">
            {/* Nếu có file vừa upload xong đang chờ xác nhận metadata, ưu
                tiên hiện form review trước — chặn không cho thêm file mới
                cho tới khi xử lý xong file hiện tại, tránh rối UI khi
                nhiều file cùng lúc. */}
            {currentReview ? (
              <SongMetadataForm
                key={currentReview.id}
                sourceLabel="File tải lên"
                durationLabel={
                  currentReview.duration
                    ? `${Math.floor(currentReview.duration / 60)}:${Math.floor(currentReview.duration % 60)
                        .toString()
                        .padStart(2, "0")}`
                    : undefined
                }
                initialTitle={currentReview.title}
                initialArtist={currentReview.artist ?? ""}
                initialThumbnail={currentReview.thumbnail ?? ""}
                onConfirm={handleConfirmReview}
                onCancel={handleCancelReview}
              />
            ) : (
              <UploadDropzone onFilesSelected={addFiles} />
            )}

            <UploadProgress files={files} onRemove={removeFile} onRetry={retryFile} />

            {pendingReview.length > 1 && (
              <p className="m-0 text-[11px] text-text-muted">
                Còn {pendingReview.length - 1} file khác đang chờ xác nhận thông tin.
              </p>
            )}

            {!permissions.autoApproveUploads && !isHost && (
              <p className="m-0 text-[11px] text-text-muted">
                Bài hát tải lên sẽ chờ host duyệt trước khi phát.
              </p>
            )}
          </div>
        ))}

      {tab === "youtube" && (
        <YoutubeInput
          apiBase={apiBase}
          currentUserName={currentUserName}
          onAdd={onAddSong}
          disabled={youtubeLocked}
        />
      )}
    </Modal>
  );
}