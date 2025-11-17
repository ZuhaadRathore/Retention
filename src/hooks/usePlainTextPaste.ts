import { useCallback } from 'react';

/**
 * Hook that provides a paste handler to strip formatting from pasted text
 * Use this with onPaste event on textarea/input elements
 */
export function usePlainTextPaste() {
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    // Prevent default paste behavior
    event.preventDefault();

    // Get plain text from clipboard
    const text = event.clipboardData.getData('text/plain');

    // Get the textarea/input element
    const target = event.target as HTMLTextAreaElement | HTMLInputElement;

    // Insert plain text at cursor position
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const value = target.value;

    const newValue = value.substring(0, start) + text + value.substring(end);

    // Update the value
    target.value = newValue;

    // Set cursor position after pasted text
    const newCursorPosition = start + text.length;
    target.setSelectionRange(newCursorPosition, newCursorPosition);

    // Trigger change event so React state updates
    const changeEvent = new Event('input', { bubbles: true });
    target.dispatchEvent(changeEvent);
  }, []);

  return handlePaste;
}
