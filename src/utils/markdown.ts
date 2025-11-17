/**
 * Simple markdown parser for deck descriptions
 * Supports basic formatting: **bold**, *italic*, [links](url), and line breaks
 */
export function parseMarkdown(text: string): string {
  if (!text) return '';

  let html = text;

  // Convert line breaks to <br> tags
  html = html.replace(/\n/g, '<br>');

  // Convert **bold** to <strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* to <em>
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Convert [text](url) to <a> tags
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary-dark">$1</a>');

  // Convert `code` to <code>
  html = html.replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-border-color/20 text-sm font-mono">$1</code>');

  return html;
}

/**
 * Component-friendly markdown renderer that returns React-safe HTML
 */
export function renderMarkdown(text: string): { __html: string } {
  return { __html: parseMarkdown(text) };
}
