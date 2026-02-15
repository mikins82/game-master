"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";

interface ActionInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ActionInput({ onSend, disabled }: ActionInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-surface-600 bg-surface-800 p-4"
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Describe your action..."
        disabled={disabled}
        rows={1}
        className={cn(
          "flex-1 resize-none rounded-lg border border-surface-600 bg-surface-700 px-4 py-2.5 text-sm text-gray-100",
          "placeholder:text-gray-500",
          "focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-1 focus:ring-offset-surface-900",
          "disabled:opacity-50",
        )}
      />
      <Button type="submit" disabled={disabled || !text.trim()} size="md">
        Send
      </Button>
    </form>
  );
}
