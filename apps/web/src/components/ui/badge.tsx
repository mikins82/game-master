import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const variants = {
  default: "bg-surface-600 text-gray-300",
  gold: "bg-gold-500/20 text-gold-400",
  blue: "bg-blue-500/20 text-blue-400",
  green: "bg-emerald-500/20 text-emerald-400",
  red: "bg-red-500/20 text-red-400",
  purple: "bg-purple-500/20 text-purple-400",
  teal: "bg-teal-500/20 text-teal-400",
  pink: "bg-pink-500/20 text-pink-400",
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

export function Badge({
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
