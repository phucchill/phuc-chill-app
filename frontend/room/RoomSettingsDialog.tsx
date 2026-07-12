"use client";

import { useEffect, useState } from "react";
import Modal from "../components/ui/Modal";
import Toggle from "../components/ui/Toggle";
import Button from "../components/ui/Button";
import { DEFAULT_ROOM_PERMISSIONS, RoomPermissions } from "../types/upload";

interface RoomSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  permissions?: RoomPermissions;
  onSave: (permissions: RoomPermissions) => void;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-input border border-divider bg-white/[0.03] px-4 py-3.5 transition-colors ${
        disabled ? "opacity-40" : "hover:bg-white/[0.05]"
      }`}
    >
      <div>
        <p className="m-0 text-[13px] font-medium text-text-primary">{label}</p>
        <p className="m-0 mt-0.5 text-[11px] text-text-muted">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export default function RoomSettingsDialog({
  isOpen,
  onClose,
  permissions = DEFAULT_ROOM_PERMISSIONS,
  onSave,
}: RoomSettingsDialogProps) {
  const [draft, setDraft] = useState<RoomPermissions>(permissions);

  // Đồng bộ lại draft mỗi khi mở dialog hoặc permissions từ server đổi
  useEffect(() => {
    if (isOpen) setDraft(permissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, permissions]);

  const patch = (partial: Partial<RoomPermissions>) => setDraft((prev) => ({ ...prev, ...partial }));

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cài đặt phòng"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-[13px] text-text-muted">Quyền thêm bài hát vào hàng chờ</p>

      <div className="flex flex-col gap-2.5">
        <ToggleRow
          label="Chỉ Host được thêm bài"
          description="Bật thì thành viên không thể thêm bài dưới bất kỳ hình thức nào"
          checked={draft.onlyHostCanAdd}
          onChange={(v) => patch({ onlyHostCanAdd: v })}
        />
        <ToggleRow
          label="Thành viên được tải file lên"
          description="Cho phép thành viên upload file nhạc local (mp3, wav, flac...)"
          checked={draft.membersCanUpload}
          onChange={(v) => patch({ membersCanUpload: v })}
          disabled={draft.onlyHostCanAdd}
        />
        <ToggleRow
          label="Thành viên được thêm link YouTube"
          description="Cho phép thành viên dán link YouTube để thêm vào hàng chờ"
          checked={draft.membersCanYoutube}
          onChange={(v) => patch({ membersCanYoutube: v })}
          disabled={draft.onlyHostCanAdd}
        />
        <ToggleRow
          label="Thành viên được tìm kiếm thư viện"
          description="Cho phép thành viên tìm và request bài từ thư viện có sẵn"
          checked={draft.membersCanSearch}
          onChange={(v) => patch({ membersCanSearch: v })}
          disabled={draft.onlyHostCanAdd}
        />
        <ToggleRow
          label="Tự động duyệt file tải lên"
          description="File thành viên tải lên vào thẳng hàng chờ, không cần Host duyệt"
          checked={draft.autoApproveUploads}
          onChange={(v) => patch({ autoApproveUploads: v })}
          disabled={draft.onlyHostCanAdd || !draft.membersCanUpload}
        />
      </div>
    </Modal>
  );
}