"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { ALLOWED_AUDIO_EXTENSIONS } from "../types/upload";

interface UploadDropzoneProps {
  onFilesSelected: (files: FileList | File[]) => void;
  disabled?: boolean;
}

export default function UploadDropzone({ onFilesSelected, disabled }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptAttr = ALLOWED_AUDIO_EXTENSIONS.map((ext) => `.${ext}`).join(",");

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed border-divider bg-white/[0.02] opacity-40"
          : isDragging
          ? "cursor-pointer border-key bg-key-soft"
          : "cursor-pointer border-border bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-avatar bg-white/10">
        <UploadCloud size={24} className="text-text-primary" strokeWidth={2} />
      </div>

      <div>
        <p className="m-0 text-sm font-medium text-text-primary">Kéo thả file nhạc vào đây</p>
        <p className="m-0 mt-1 text-xs text-text-muted">
          hoặc <span className="text-text-secondary underline">chọn file từ máy</span>
        </p>
      </div>

      <p className="m-0 text-[11px] text-text-muted">
        Hỗ trợ: {ALLOWED_AUDIO_EXTENSIONS.join(", ").toUpperCase()} · Tối đa 50MB
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFilesSelected(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}