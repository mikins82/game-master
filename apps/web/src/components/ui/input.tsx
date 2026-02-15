import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <input
        id={id}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border bg-surface-800 px-3 text-sm text-gray-100",
          "placeholder:text-gray-500",
          "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface-900",
          error
            ? "border-red-500 focus:ring-red-500"
            : "border-surface-600 focus:ring-gold-500",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  ),
);
Input.displayName = "Input";
