import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Chore, FamilyReminderSettings, Profile } from '../types';
import { DEFAULT_REMINDER_SETTINGS, formatReminderLeadMinutes, normalizeReminderSettings } from './familySettings';
import { namesMatch } from './nameMatch';

const STORAGE_KEY = 'choreReminderMap_v2';

type ReminderEntry = {
  dueAtMs: number;
  morningId?: string;
  finalId?: string;
  morningReminderHour: number;
  morningReminderMinute: number;
  finalReminderLeadMinutes: number;
};

type ReminderMap = Record<string, ReminderEntry>;

const getDueAtMs = (chore: Chore): number | null => {
  const dueAt = (chore as any)?.dueAt;
  if (!dueAt) return null;
  const date = dueAt?.toDate ? dueAt.toDate() : dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.getTime();
};

const isEligibleStatus = (status?: string) =>
  status === 'pending' || status === 'in_progress' || status === 'redo';

const scheduleOne = async (title: string, body: string, date: Date) => {
  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
};

const cancelIfPresent = async (id?: string) => {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Swallow errors for already-cancelled notifications.
  }
};

export async function syncChoreReminders(
  profile: Profile,
  chores: Chore[],
  reminderSettings: FamilyReminderSettings = DEFAULT_REMINDER_SETTINGS
) {
  if (!Device.isDevice) return;

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') return;

  const settings = normalizeReminderSettings(reminderSettings);
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const existing: ReminderMap = raw ? JSON.parse(raw) : {};
  const next: ReminderMap = { ...existing };

  const now = Date.now();

  const eligible = chores.filter((chore) => {
    if (!isEligibleStatus(chore.status)) return false;
    if (chore.isBounty) return false;
    if (chore.assignedToUid) return chore.assignedToUid === profile.uid;
    return namesMatch(chore.assignedTo, profile.displayName);
  });

  const eligibleIds = new Set(eligible.map((c) => c.id));

  for (const [choreId, entry] of Object.entries(existing)) {
    const chore = eligible.find((c) => c.id === choreId);
    const dueAtMs = chore ? getDueAtMs(chore) : null;
    const settingsChanged =
      entry.morningReminderHour !== settings.morningReminderHour ||
      entry.morningReminderMinute !== settings.morningReminderMinute ||
      entry.finalReminderLeadMinutes !== settings.finalReminderLeadMinutes;
    if (!chore || !dueAtMs || dueAtMs !== entry.dueAtMs || !eligibleIds.has(choreId) || settingsChanged) {
      await cancelIfPresent(entry.morningId);
      await cancelIfPresent(entry.finalId);
      delete next[choreId];
    }
  }

  for (const chore of eligible) {
    const dueAtMs = getDueAtMs(chore);
    if (!dueAtMs) continue;
    const existingEntry = next[chore.id];
    if (existingEntry && existingEntry.dueAtMs === dueAtMs) continue;

    const dueDate = new Date(dueAtMs);
    const morning = new Date(dueDate);
    morning.setHours(settings.morningReminderHour, settings.morningReminderMinute, 0, 0);
    const finalReminderAt = new Date(dueAtMs - settings.finalReminderLeadMinutes * 60 * 1000);

    const title = 'Chore Reminder';
    const body = `${chore.title} is due today.`;
    const bodySoon = `${chore.title} is due in ${formatReminderLeadMinutes(settings.finalReminderLeadMinutes).replace(' before', '')}.`;

    const entry: ReminderEntry = {
      dueAtMs,
      morningReminderHour: settings.morningReminderHour,
      morningReminderMinute: settings.morningReminderMinute,
      finalReminderLeadMinutes: settings.finalReminderLeadMinutes,
    };
    if (morning.getTime() > now) {
      entry.morningId = await scheduleOne(title, body, morning);
    }
    if (finalReminderAt.getTime() > now) {
      entry.finalId = await scheduleOne(title, bodySoon, finalReminderAt);
    }

    if (entry.morningId || entry.finalId) {
      next[chore.id] = entry;
    }
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
