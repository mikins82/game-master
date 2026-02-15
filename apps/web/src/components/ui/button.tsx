import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

const variants = {
  primary:
    "bg-gold-500 text-surface-900 hover:bg-gold-400 focus-visible:ring-gold-400",
  secondary:
    "bg-surface-600 text-gray-100 hover:bg-surface-500 focus-visible:ring-surface-500",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500",
  ghost:
    "bg-transparent text-gray-300 hover:bg-surface-700 hover:text-gray-100",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
