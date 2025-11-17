/**
 * Format a timestamp as a relative time string (e.g., "2 minutes ago", "yesterday")
 */
export function formatRelativeTime(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  // Future dates
  if (diffMs < 0) {
    const absDiffMs = Math.abs(diffMs);
    const absDiffMinutes = Math.floor(absDiffMs / (60 * 1000));
    const absDiffHours = Math.floor(absDiffMs / (60 * 60 * 1000));
    const absDiffDays = Math.floor(absDiffMs / (24 * 60 * 60 * 1000));

    if (absDiffMinutes < 60) {
      return absDiffMinutes === 1 ? 'in 1 minute' : `in ${absDiffMinutes} minutes`;
    }
    if (absDiffHours < 24) {
      return absDiffHours === 1 ? 'in 1 hour' : `in ${absDiffHours} hours`;
    }
    if (absDiffDays === 1) {
      return 'tomorrow';
    }
    if (absDiffDays < 7) {
      return `in ${absDiffDays} days`;
    }
    return date.toLocaleDateString();
  }

  // Past dates
  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  if (diffWeeks === 1) {
    return '1 week ago';
  }
  if (diffWeeks < 4) {
    return `${diffWeeks} weeks ago`;
  }
  if (diffMonths === 1) {
    return '1 month ago';
  }
  if (diffMonths < 12) {
    return `${diffMonths} months ago`;
  }
  if (diffYears === 1) {
    return '1 year ago';
  }
  return `${diffYears} years ago`;
}

/**
 * Format a session age in milliseconds as a relative time string
 */
export function formatSessionAge(timestampMs: number): string {
  const ageMs = Date.now() - timestampMs;
  const minutes = Math.floor(ageMs / (60 * 1000));
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  return "just now";
}
