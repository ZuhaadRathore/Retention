import { useEffect, useRef } from "react";

/**
 * Hook to auto-resize a textarea based on its content
 */
export function useAutoResizeTextarea<T extends HTMLTextAreaElement>(
  value: string,
  minHeight: number = 100,
  maxHeight: number = 500
) {
  const textareaRef = useRef<T>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to recalculate
    textarea.style.height = "auto";

    // Calculate new height
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    textarea.style.height = `${newHeight}px`;
  }, [value, minHeight, maxHeight]);

  return textareaRef;
}
