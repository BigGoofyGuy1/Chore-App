import { ChoreSchedule, Weekday, WeeklyConsistency } from '../types';

export const WEEKDAY_LABELS: Array<{ value: Weekday; short: string; label: string }> = [
  { value: 0, short: 'S', label: 'Sunday' },
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
];

export const DEFAULT_WEEKLY_GOAL_DAYS = 5;
export const DEFAULT_WEEKLY_BONUS_POINTS = 10;

export const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const startOfWeek = (value: Date = new Date()) => {
  const date = new Date(value.getTime());
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
};

export const weekKey = (value: Date = new Date()) => dateKey(startOfWeek(value));

export const buildWeeklyConsistency = (
  current?: WeeklyConsistency,
  now: Date = new Date()
): WeeklyConsistency => {
  const currentWeekKey = weekKey(now);
  if (current?.weekKey === currentWeekKey) {
    return {
      ...current,
      completedDays: Array.from(new Set(current.completedDays || [])).sort(),
      goalDays: current.goalDays || DEFAULT_WEEKLY_GOAL_DAYS,
      bonusPoints: current.bonusPoints || DEFAULT_WEEKLY_BONUS_POINTS,
    };
  }

  return {
    weekKey: currentWeekKey,
    completedDays: [],
    goalDays: DEFAULT_WEEKLY_GOAL_DAYS,
    bonusPoints: DEFAULT_WEEKLY_BONUS_POINTS,
    bonusAwarded: false,
  };
};

export const nextScheduledDate = (
  schedule: ChoreSchedule,
  from: Date = new Date(),
  includeCurrent = true
) => {
  const weekdays = new Set(schedule.weekdays);
  const start = new Date(from.getTime());

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(start.getTime());
    candidate.setDate(start.getDate() + offset);
    candidate.setHours(schedule.hour, schedule.minute, 0, 0);
    if (!weekdays.has(candidate.getDay() as Weekday)) continue;
    if (candidate.getTime() > from.getTime() || (includeCurrent && candidate.getTime() === from.getTime())) {
      return candidate;
    }
  }

  return null;
};

export const formatSchedule = (schedule: ChoreSchedule) => {
  const weekdayNames = WEEKDAY_LABELS
    .filter((weekday) => schedule.weekdays.includes(weekday.value))
    .map((weekday) => weekday.label.slice(0, 3))
    .join(', ');
  const time = new Date();
  time.setHours(schedule.hour, schedule.minute, 0, 0);
  return `${weekdayNames || 'No days'} at ${time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};
