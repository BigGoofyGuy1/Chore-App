export const formatDate = (date: Date) => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${m}-${d}-${y}`;
};

export type ChoreDateScope = 'today' | 'week';

export const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDateValue = (value as { toDate?: unknown }).toDate;
    if (typeof toDateValue === 'function') {
      const converted = toDateValue.call(value);
      return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
    }
  }

  return null;
};

export const isDueInScope = (
  dueAt: unknown,
  scope: ChoreDateScope,
  now: Date = new Date()
) => {
  const dueDate = toDate(dueAt);
  if (!dueDate) return true;

  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + (scope === 'today' ? 1 : 7));

  // Include overdue work and use an exclusive upper bound for stable day boundaries.
  return dueDate.getTime() < end.getTime();
};
