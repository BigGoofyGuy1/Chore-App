import { FamilyReminderSettings, FamilySettings } from '../types';

export const DEFAULT_REMINDER_SETTINGS: FamilyReminderSettings = {
  morningReminderHour: 7,
  morningReminderMinute: 0,
  finalReminderLeadMinutes: 60,
};

export const REMINDER_LEAD_OPTIONS = [15, 30, 60, 120, 180, 720, 1440];

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
};

export const normalizeReminderSettings = (
  reminderSettings?: Partial<FamilyReminderSettings> | null
): FamilyReminderSettings => ({
  morningReminderHour: clampNumber(
    reminderSettings?.morningReminderHour,
    0,
    23,
    DEFAULT_REMINDER_SETTINGS.morningReminderHour
  ),
  morningReminderMinute: clampNumber(
    reminderSettings?.morningReminderMinute,
    0,
    59,
    DEFAULT_REMINDER_SETTINGS.morningReminderMinute
  ),
  finalReminderLeadMinutes: clampNumber(
    reminderSettings?.finalReminderLeadMinutes,
    5,
    7 * 24 * 60,
    DEFAULT_REMINDER_SETTINGS.finalReminderLeadMinutes
  ),
});

export const buildFamilySettings = (
  familyCode: string,
  data?: Partial<FamilySettings> | null
): FamilySettings => ({
  familyCode,
  reminderSettings: normalizeReminderSettings(data?.reminderSettings),
  updatedAt: data?.updatedAt,
  updatedByUid: data?.updatedByUid ?? null,
  updatedByName: data?.updatedByName ?? null,
});

export const formatReminderLeadMinutes = (minutes: number) => {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 day before' : `${days} days before`;
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour before' : `${hours} hours before`;
  }

  return `${minutes} min before`;
};
