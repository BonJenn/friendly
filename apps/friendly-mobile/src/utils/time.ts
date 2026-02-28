export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function isWithinCallWindow(
  startHour: number,
  endHour: number,
  timezone: string
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });
  const currentHour = parseInt(formatter.format(now), 10);

  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }
  // Window crosses midnight
  return currentHour >= startHour || currentHour < endHour;
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
