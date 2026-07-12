"use client";

import { motion } from "framer-motion";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * Toggle kiểu iOS — thay thế <input type="checkbox"> mặc định của trình
 * duyệt trong RoomSettingsDialog. Component thuần trình bày, logic bật/tắt
 * vẫn do component cha quyết định qua checked/onChange như checkbox thường.
 */
export default function Toggle({ checked, onChange, disabled, ...aria }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-[26px] w-[46px] flex-shrink-0 rounded-full transition-colors duration-200 ease-out ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${checked ? "bg-key" : "bg-white/15"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
        style={{ left: checked ? "calc(100% - 23px)" : "3px" }}
      />
    </button>
  );
}