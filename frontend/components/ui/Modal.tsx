"use client";

import { ReactNode, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** vd max-w-[560px] — mặc định 480px */
  maxWidthClassName?: string;
  footer?: ReactNode;
}

/**
 * Modal chuẩn dùng chung cho toàn bộ dialog trong Music Room (Thêm bài hát,
 * Cài đặt phòng...). Chỉ lo trình bày (backdrop, khung, animation,
 * nút đóng, phím Escape) — nội dung/logic bên trong do component cha
 * truyền vào qua children, không đổi hành vi nghiệp vụ nào.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-[480px]",
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <motion.div
            key="panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`glass-card flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-card bg-surface/95`}
          >
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-divider px-6 py-5">
              <h2 className="m-0 text-[18px] font-semibold text-text-primary">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/5 text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            {/* Body */}
            <div className="apple-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {/* Footer (tuỳ chọn) */}
            {footer && (
              <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-divider px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}