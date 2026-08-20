import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { db } from '../firebase';
import { Chore, FamilySettings, Profile } from '../types';
import {
  formatReminderLeadMinutes,
  normalizeReminderSettings,
  REMINDER_LEAD_OPTIONS,
} from '../utils/familySettings';
import { namesMatch } from '../utils/nameMatch';
import { sendPushNotification, triggerHapticSuccess } from '../utils/sendPushNotification';

interface ParentSettingsScreenProps {
  profile: Profile;
  familyMembers: Profile[];
  chores: Chore[];
  familySettings: FamilySettings;
}

const isOpenChore = (status?: string) =>
  status === 'pending' || status === 'in_progress' || status === 'redo';

const formatTimeLabel = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

const getDueDate = (chore: Chore) => {
  const dueAt = (chore as any)?.dueAt;
  if (!dueAt) return null;
  const date = dueAt?.toDate ? dueAt.toDate() : dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDueLabel = (chore: Chore) => {
  const date = getDueDate(chore);
  if (!date) return 'No due date';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildReminderTime = (hour: number, minute: number) => {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  return next;
};

const summarizeTitles = (titles: string[]) => {
  if (!titles.length) return 'open chores';
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles[0]}, ${titles[1]}, and ${titles.length - 2} more`;
};

export const ParentSettingsScreen: React.FC<ParentSettingsScreenProps> = ({
  profile,
  familyMembers,
  chores,
  familySettings,
}) => {
  const normalizedSettings = normalizeReminderSettings(familySettings.reminderSettings);
  const [morningReminderTime, setMorningReminderTime] = useState<Date>(() =>
    buildReminderTime(
      normalizedSettings.morningReminderHour,
      normalizedSettings.morningReminderMinute
    )
  );
  const [finalReminderLeadMinutes, setFinalReminderLeadMinutes] = useState(
    normalizedSettings.finalReminderLeadMinutes
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  useEffect(() => {
    setMorningReminderTime(
      buildReminderTime(
        normalizedSettings.morningReminderHour,
        normalizedSettings.morningReminderMinute
      )
    );
    setFinalReminderLeadMinutes(normalizedSettings.finalReminderLeadMinutes);
  }, [
    normalizedSettings.finalReminderLeadMinutes,
    normalizedSettings.morningReminderHour,
    normalizedSettings.morningReminderMinute,
  ]);

  const membersByUid = useMemo(() => {
    const map = new Map<string, Profile>();
    familyMembers.forEach((member) => {
      map.set(member.uid, member);
    });
    return map;
  }, [familyMembers]);

  const childRecipients = useMemo(
    () => familyMembers.filter((member) => member.role === 'child' && member.pushToken),
    [familyMembers]
  );

  const openChores = useMemo(() => {
    return chores
      .filter((chore) => isOpenChore(chore.status))
      .sort((a, b) => {
        const aDueAt = getDueDate(a)?.getTime() ?? Infinity;
        const bDueAt = getDueDate(b)?.getTime() ?? Infinity;
        return aDueAt - bDueAt;
      });
  }, [chores]);

  const getAssignedMember = (chore: Chore) => {
    if (chore.assignedToUid) {
      return membersByUid.get(chore.assignedToUid) || null;
    }
    return familyMembers.find((member) => namesMatch(member.displayName, chore.assignedTo)) || null;
  };

  const getChoreRecipients = (chore: Chore) => {
    if (chore.isBounty) {
      return childRecipients;
    }

    const assignedMember = getAssignedMember(chore);
    if (!assignedMember?.pushToken) return [];
    return [assignedMember];
  };

  const currentTimeKey = `${normalizedSettings.morningReminderHour}:${normalizedSettings.morningReminderMinute}`;
  const selectedTimeKey = `${morningReminderTime.getHours()}:${morningReminderTime.getMinutes()}`;
  const hasSettingsChanges =
    currentTimeKey !== selectedTimeKey ||
    normalizedSettings.finalReminderLeadMinutes !== finalReminderLeadMinutes;

  const handleSaveSettings = async () => {
    if (!profile.familyCode) {
      Alert.alert('Missing Family Code', 'Unable to save reminder settings right now.');
      return;
    }

    setSaving(true);
    try {
      const reminderSettings = normalizeReminderSettings({
        morningReminderHour: morningReminderTime.getHours(),
        morningReminderMinute: morningReminderTime.getMinutes(),
        finalReminderLeadMinutes,
      });

      await setDoc(
        doc(collection(db, 'families'), profile.familyCode),
        {
          familyCode: profile.familyCode,
          reminderSettings,
          updatedAt: serverTimestamp(),
          updatedByUid: profile.uid,
          updatedByName: profile.displayName,
        },
        { merge: true }
      );

      triggerHapticSuccess();
      Alert.alert('Saved', 'Reminder settings updated.');
    } catch (error: any) {
      console.error('Save reminder settings error:', error);
      Alert.alert('Save Failed', error?.message || 'Unable to update reminder settings.');
    } finally {
      setSaving(false);
    }
  };

  const sendReminderForChore = async (chore: Chore) => {
    const recipients = getChoreRecipients(chore);
    if (!recipients.length) {
      Alert.alert('No Recipient', 'No eligible family device is set up for this reminder.');
      return;
    }

    setSendingKey(chore.id);
    try {
      const body = chore.isBounty
        ? `${chore.title} is still up for grabs. Due ${formatDueLabel(chore)}.`
        : `${chore.title} is still open. Due ${formatDueLabel(chore)}.`;

      await Promise.all(
        recipients.map((recipient) =>
          sendPushNotification(
            recipient.pushToken!,
            chore.isBounty ? 'Bounty Reminder' : 'Chore Reminder',
            body
          )
        )
      );

      triggerHapticSuccess();
      Alert.alert('Reminder Sent', `Sent to ${recipients.map((recipient) => recipient.displayName).join(', ')}.`);
    } catch (error: any) {
      console.error('Send chore reminder error:', error);
      Alert.alert('Send Failed', error?.message || 'Unable to send reminder.');
    } finally {
      setSendingKey(null);
    }
  };

  const sendBulkReminders = async () => {
    if (!openChores.length) {
      Alert.alert('Nothing To Send', 'There are no open chores to remind anyone about.');
      return;
    }

    setSendingKey('all');
    try {
      const grouped = new Map<string, { member: Profile; titles: string[] }>();
      const bountyTitles: string[] = [];

      openChores.forEach((chore) => {
        if (chore.isBounty) {
          bountyTitles.push(chore.title);
          return;
        }

        const assignedMember = getAssignedMember(chore);
        if (!assignedMember?.pushToken) return;

        const existing = grouped.get(assignedMember.uid);
        if (existing) {
          existing.titles.push(chore.title);
          return;
        }

        grouped.set(assignedMember.uid, { member: assignedMember, titles: [chore.title] });
      });

      const sends: Promise<unknown>[] = [];

      grouped.forEach(({ member, titles }) => {
        sends.push(
          sendPushNotification(
            member.pushToken!,
            'Chore Reminder',
            `You still have ${titles.length} open chore${titles.length === 1 ? '' : 's'}: ${summarizeTitles(titles)}.`
          )
        );
      });

      if (bountyTitles.length && childRecipients.length) {
        childRecipients.forEach((child) => {
          sends.push(
            sendPushNotification(
              child.pushToken!,
              'Bounty Reminder',
              `${bountyTitles.length} bounty chore${bountyTitles.length === 1 ? '' : 's'} still need attention: ${summarizeTitles(bountyTitles)}.`
            )
          );
        });
      }

      if (!sends.length) {
        Alert.alert('No Recipient', 'No eligible family devices are set up for open-chore reminders.');
        return;
      }

      await Promise.all(sends);
      triggerHapticSuccess();
      Alert.alert('Reminders Sent', `Delivered ${sends.length} reminder${sends.length === 1 ? '' : 's'}.`);
    } catch (error: any) {
      console.error('Send all reminders error:', error);
      Alert.alert('Send Failed', error?.message || 'Unable to send reminders.');
    } finally {
      setSendingKey(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Parent Settings</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Reminder Schedule</Text>
        <Text style={styles.helperText}>
          These reminder times sync to family devices and control the local alerts children see for open chores.
        </Text>

        <Text style={styles.inputLabel}>Morning reminder</Text>
        <TouchableOpacity style={styles.timeButton} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.timeButtonText}>{formatTimeLabel(morningReminderTime)}</Text>
        </TouchableOpacity>
        {showTimePicker ? (
          <DateTimePicker
            value={morningReminderTime}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, nextValue) => {
              if (Platform.OS !== 'ios') {
                setShowTimePicker(false);
              }
              if (nextValue) {
                setMorningReminderTime(nextValue);
              }
            }}
          />
        ) : null}
        {showTimePicker && Platform.OS === 'ios' ? (
          <TouchableOpacity style={styles.inlineLink} onPress={() => setShowTimePicker(false)}>
            <Text style={styles.inlineLinkText}>Done</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.inputLabel}>Final reminder</Text>
        <View style={styles.chipRow}>
          {REMINDER_LEAD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, finalReminderLeadMinutes === option && styles.chipActive]}
              onPress={() => setFinalReminderLeadMinutes(option)}
            >
              <Text
                style={[
                  styles.chipText,
                  finalReminderLeadMinutes === option && styles.chipTextActive,
                ]}
              >
                {formatReminderLeadMinutes(option)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, (!hasSettingsChanges || saving) && styles.disabledBtn]}
          onPress={handleSaveSettings}
          disabled={!hasSettingsChanges || saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Save Reminder Settings</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.subtleNote}>
          Updated reminder times take effect the next time each family device syncs the app.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Manual Push Reminders</Text>
        <Text style={styles.helperText}>
          Re-send a push notification for any open chore or send a bulk nudge to everyone with pending work.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, sendingKey === 'all' && styles.disabledBtn]}
          onPress={sendBulkReminders}
          disabled={sendingKey === 'all' || !openChores.length}
        >
          {sendingKey === 'all' ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Remind Everyone With Open Chores</Text>
          )}
        </TouchableOpacity>

        {openChores.length ? (
          openChores.map((chore) => {
            const recipients = getChoreRecipients(chore);
            const assigneeLabel = chore.isBounty
              ? 'Bounty for all children'
              : getAssignedMember(chore)?.displayName || chore.assignedTo || 'Unassigned';

            return (
              <View key={chore.id} style={styles.choreRow}>
                <View style={styles.choreCopy}>
                  <Text style={styles.choreTitle}>{chore.title}</Text>
                  <Text style={styles.choreMeta}>
                    {assigneeLabel} | {formatDueLabel(chore)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    (!recipients.length || sendingKey === chore.id) && styles.secondaryBtnDisabled,
                  ]}
                  onPress={() => sendReminderForChore(chore)}
                  disabled={!recipients.length || sendingKey === chore.id}
                >
                  {sendingKey === chore.id ? (
                    <ActivityIndicator color="#2563EB" size="small" />
                  ) : (
                    <Text style={styles.secondaryBtnText}>
                      {recipients.length ? 'Send' : 'No Device'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No open chores need reminders right now.</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 120 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  helperText: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#64748B' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginTop: 18, marginBottom: 8 },
  timeButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeButtonText: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  inlineLink: { alignSelf: 'flex-end', marginTop: 8 },
  inlineLinkText: { color: '#2563EB', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#FFF' },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledBtn: { backgroundColor: '#94A3B8' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  subtleNote: { marginTop: 12, fontSize: 12, lineHeight: 18, color: '#64748B' },
  choreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 12,
  },
  choreCopy: { flex: 1 },
  choreTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  choreMeta: { marginTop: 4, fontSize: 13, color: '#64748B' },
  secondaryBtn: {
    minWidth: 86,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
  },
  secondaryBtnDisabled: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  secondaryBtnText: { color: '#2563EB', fontWeight: '700' },
  emptyText: { marginTop: 16, color: '#94A3B8', fontStyle: 'italic' },
});
