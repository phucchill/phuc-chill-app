"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { motion, HTMLMotionProps } from "framer-motion";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref">,
    Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-key text-white hover:brightness-110",
  secondary: "bg-surface text-text-primary border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-text-secondary hover:bg-white/[0.06] hover:text-text-primary",
  danger: "bg-key/90 text-white hover:brightness-110",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[12px] gap-1.5",
  md: "px-4 py-2.5 text-[13px] gap-2",
  lg: "px-5 py-3 text-[14px] gap-2.5",
};

/**
 * Button chuẩn hoá dùng khắp Music Room — thay thế mọi <button> style tay
 * rời rạc trước đó. Giữ nguyên onClick/disabled/type như <button> thường,
 * chỉ thêm variant/size để đồng bộ giao diện.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", fullWidth, className = "", children, disabled, ...props },
  ref
) {
  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`inline-flex items-center justify-center rounded-button font-medium transition-[background,filter] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 ${
        variantClasses[variant]
      } ${sizeClasses[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
});

export default Button;