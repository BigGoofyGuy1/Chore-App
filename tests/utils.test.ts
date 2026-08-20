import { formatDate, isDueInScope, toDate } from '../src/utils/date';
import {
  buildFamilySettings,
  formatReminderLeadMinutes,
  normalizeReminderSettings,
} from '../src/utils/familySettings';
import { namesMatch, normalizeName } from '../src/utils/nameMatch';
import { buildWeeklyConsistency, nextScheduledDate, startOfWeek } from '../src/utils/schedule';

describe('family utility behavior', () => {
  test('normalizes names without accepting empty values as matches', () => {
    expect(normalizeName('  KiD A ')).toBe('kid a');
    expect(namesMatch(' Kid A ', 'kid a')).toBe(true);
    expect(namesMatch('', '')).toBe(false);
  });

  test('clamps reminder settings to supported values', () => {
    expect(
      normalizeReminderSettings({
        morningReminderHour: 99,
        morningReminderMinute: -3,
        finalReminderLeadMinutes: 99999,
      })
    ).toEqual({
      morningReminderHour: 23,
      morningReminderMinute: 0,
      finalReminderLeadMinutes: 10080,
    });
    expect(formatReminderLeadMinutes(60)).toBe('1 hour before');
    expect(formatReminderLeadMinutes(2880)).toBe('2 days before');
  });

  test('builds safe family settings defaults', () => {
    expect(buildFamilySettings('FAM1')).toMatchObject({
      familyCode: 'FAM1',
      updatedByUid: null,
      updatedByName: null,
      reminderSettings: {
        morningReminderHour: 7,
        morningReminderMinute: 0,
        finalReminderLeadMinutes: 60,
      },
    });
  });

  test('selects the next scheduled time and resets weekly consistency', () => {
    const monday = new Date(2026, 7, 17, 8, 0, 0);
    expect(startOfWeek(new Date(2026, 7, 20, 12, 0, 0))).toEqual(
      new Date(2026, 7, 17, 0, 0, 0)
    );
    expect(
      nextScheduledDate({ weekdays: [1], hour: 9, minute: 30, timezone: 'America/Chicago' }, monday)
    ).toEqual(new Date(2026, 7, 17, 9, 30, 0));
    expect(
      buildWeeklyConsistency(
        {
          weekKey: '2026-08-10',
          completedDays: ['2026-08-10'],
          goalDays: 3,
          bonusPoints: 5,
          bonusAwarded: true,
        },
        monday
      )
    ).toMatchObject({
      weekKey: '2026-08-17',
      completedDays: [],
      bonusAwarded: false,
    });
  });

  test('handles date-like values and inclusive overdue scopes', () => {
    const now = new Date(2026, 7, 20, 12, 0, 0);
    const timestampLike = { toDate: () => new Date(2026, 7, 20, 23, 59, 0) };
    expect(toDate(timestampLike)).toEqual(timestampLike.toDate());
    expect(isDueInScope(timestampLike, 'today', now)).toBe(true);
    expect(isDueInScope(new Date(2026, 7, 21, 0, 0, 0), 'today', now)).toBe(false);
    expect(formatDate(new Date(2026, 7, 20))).toBe('08-20-26');
  });
});
