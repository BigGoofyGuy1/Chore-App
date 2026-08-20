import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '@react-native-firebase/firestore';
import { db, timestampFromDate } from '../firebase';
import { ChoreSchedule, ChoreTemplate, Profile, Weekday } from '../types';
import { sendPushNotification, triggerHapticSuccess } from '../utils/sendPushNotification';
import { dateKey, formatSchedule, nextScheduledDate, WEEKDAY_LABELS } from '../utils/schedule';

interface AssignScreenProps {
  profile: Profile;
  familyMembers: Profile[];
  templates: ChoreTemplate[];
}

type ScheduleMode = 'once' | 'weekdays';

const formatDateTime = (date: Date) =>
  `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

const getErrorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Unknown error occurred.';

export const AssignScreen: React.FC<AssignScreenProps> = ({ profile, familyMembers, templates }) => {
  const defaultTime = useMemo(() => {
    const value = new Date();
    value.setHours(18, 0, 0, 0);
    return value;
  }, []);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [pts, setPts] = useState('5');
  const [selectedUid, setSelectedUid] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(defaultTime);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('once');
  const [weekdays, setWeekdays] = useState<Weekday[]>([1, 2, 3, 4, 5]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const children = useMemo(
    () => familyMembers.filter((member) => member.role === 'child' && member.displayName?.trim()),
    [familyMembers]
  );
  const parents = useMemo(
    () => familyMembers.filter((member) => member.role === 'parent' && member.displayName?.trim()),
    [familyMembers]
  );
  const activeTemplates = useMemo(() => templates.filter((template) => template.title?.trim()), [templates]);

  const buildSchedule = (): ChoreSchedule => ({
    weekdays: scheduleMode === 'weekdays' ? weekdays : [date.getDay() as Weekday],
    hour: time.getHours(),
    minute: time.getMinutes(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
  });

  const resolveDueAt = () => {
    if (scheduleMode === 'weekdays') {
      return nextScheduledDate(buildSchedule(), new Date());
    }
    const dueAt = new Date(date.getTime());
    dueAt.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return dueAt;
  };

  const toggleWeekday = (weekday: Weekday) => {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((value) => value !== weekday)
        : [...current, weekday].sort((a, b) => a - b)
    );
  };

  const applyTemplate = (template: ChoreTemplate) => {
    setTitle(template.title);
    setDesc(template.description || '');
    setPts(String(template.points || 0));
    setSelectedUid(template.isBounty ? 'BOUNTY' : template.assignedToUid || '');
    setWeekdays(template.schedule.weekdays);
    const templateTime = new Date();
    templateTime.setHours(template.schedule.hour, template.schedule.minute, 0, 0);
    setTime(templateTime);
    setScheduleMode('once');
    setSaveAsTemplate(false);
    setSelectedTemplateId(template.id);
  };

  const resetForm = () => {
    setTitle('');
    setDesc('');
    setPts('5');
    setSelectedUid('');
    setDate(new Date());
    setScheduleMode('once');
    setSaveAsTemplate(false);
    setSelectedTemplateId(null);
  };

  const save = async () => {
    if (!title.trim() || !selectedUid) {
      Alert.alert('Missing Information', 'Provide a title and select a person.');
      return;
    }
    if (scheduleMode === 'weekdays' && !weekdays.length) {
      Alert.alert('Choose Days', 'Select at least one weekday for this routine.');
      return;
    }

    const points = Number(pts);
    if (!Number.isInteger(points) || points < 0) {
      Alert.alert('Invalid Points', 'Points must be a whole number of zero or more.');
      return;
    }

    const isBounty = selectedUid === 'BOUNTY';
    const target = isBounty ? null : familyMembers.find((member) => member.uid === selectedUid);
    if (!isBounty && !target) {
      Alert.alert('Person Not Found', 'Select a current member of your family.');
      return;
    }

    const dueAt = resolveDueAt();
    if (!dueAt) {
      Alert.alert('Schedule Error', 'Unable to find the next selected weekday.');
      return;
    }

    setSaving(true);
    try {
      const schedule = buildSchedule();
      let templateId = selectedTemplateId;
      const shouldCreateTemplate = !selectedTemplateId && (saveAsTemplate || scheduleMode === 'weekdays');

      if (shouldCreateTemplate) {
        const followingDueAt = nextScheduledDate(schedule, dueAt, false);
        const templateRef = await addDoc(collection(db, 'choreTemplates'), {
          title: title.trim(),
          description: desc.trim(),
          points,
          assignedTo: isBounty ? 'Anyone' : target!.displayName.trim(),
          assignedToUid: isBounty ? null : target!.uid,
          isBounty,
          required: !isBounty,
          familyCode: profile.familyCode,
          steps: [],
          schedule,
          nextDueAt: followingDueAt ? timestampFromDate(followingDueAt) : timestampFromDate(dueAt),
          active: scheduleMode === 'weekdays',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdByUid: profile.uid,
          createdByName: profile.displayName,
        });
        templateId = templateRef.id;
      }

      const choreData = {
        title: title.trim(),
        description: desc.trim(),
        points,
        assignedTo: isBounty ? 'Anyone' : target!.displayName.trim(),
        assignedToUid: isBounty ? null : target!.uid,
        familyCode: profile.familyCode,
        status: 'pending',
        createdAt: serverTimestamp(),
        repeat: 'none',
        dueAt: timestampFromDate(dueAt),
        steps: [],
        archived: false,
        archivedAt: null,
        isBounty,
        required: !isBounty,
        templateId: templateId || null,
        scheduledDate: dateKey(dueAt),
      };

      if (shouldCreateTemplate && templateId && scheduleMode === 'weekdays') {
        const occurrenceRef = doc(collection(db, 'chores'), `${templateId}_${dateKey(dueAt)}`);
        const existingOccurrence = await getDoc(occurrenceRef);
        if (existingOccurrence.exists) throw new Error('That scheduled chore already exists.');
        await setDoc(occurrenceRef, choreData);
      } else {
        await addDoc(collection(db, 'chores'), choreData);
      }

      if (isBounty) {
        familyMembers
          .filter((member) => member.role === 'child' && member.pushToken)
          .forEach((member) => {
            sendPushNotification(member.pushToken!, 'New Bounty!', `${title.trim()} is worth ${points} points.`);
          });
      } else if (target!.pushToken) {
        sendPushNotification(
          target!.pushToken!,
          scheduleMode === 'weekdays' ? 'New Chore Routine' : 'New Chore Assigned',
          `${title.trim()} is due ${formatDateTime(dueAt)}.`
        );
      }

      triggerHapticSuccess();
      const successTitle = title.trim();
      const successMode = scheduleMode;
      resetForm();
      Alert.alert(
        successMode === 'weekdays' ? 'Routine Scheduled' : 'Chore Assigned',
        successMode === 'weekdays'
          ? `${successTitle} will repeat on ${formatSchedule(schedule)}.`
          : `${successTitle} was assigned successfully.`
      );
    } catch (error: unknown) {
      console.error('Save Chore Error:', error);
      Alert.alert('Assignment Failed', getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Assign & Schedule</Text>

      {activeTemplates.length ? (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Reusable Templates</Text>
          <Text style={styles.helperText}>Tap a template to fill the form, then choose a date and assign it again.</Text>
          {activeTemplates.map((template) => (
            <TouchableOpacity
              key={template.id}
              accessibilityRole="button"
              style={[styles.templateRow, selectedTemplateId === template.id && styles.templateRowActive]}
              onPress={() => applyTemplate(template)}
            >
              <View style={styles.templateCopy}>
                <Text style={styles.templateTitle}>{template.title}</Text>
                <Text style={styles.templateMeta}>
                  {template.active ? formatSchedule(template.schedule) : 'Reusable one-time template'} · {template.points} pts
                </Text>
              </View>
              <Text style={styles.templateUse}>Use</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.formCard}>
        {selectedTemplateId ? (
          <View style={styles.selectedTemplateBanner}>
            <Text style={styles.selectedTemplateText}>Using a saved template</Text>
            <TouchableOpacity accessibilityRole="button" onPress={resetForm}>
              <Text style={styles.clearTemplateText}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.inputLabel}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Empty the dishwasher"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.inputLabel}>Points</Text>
        <TextInput style={styles.input} value={pts} onChangeText={setPts} keyboardType="numeric" />

        <Text style={styles.inputLabel}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={desc}
          onChangeText={setDesc}
          multiline
          placeholder="What does done look like?"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.inputLabel}>To Whom?</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.chip, selectedUid === 'BOUNTY' && styles.chipActive]}
            onPress={() => setSelectedUid('BOUNTY')}
          >
            <Text style={[styles.chipText, selectedUid === 'BOUNTY' && styles.chipTextActive]}>Bounty (Optional)</Text>
          </TouchableOpacity>
        </View>
        {children.length ? <Text style={styles.groupLabel}>Children</Text> : null}
        <View style={styles.chipRow}>
          {children.map((member) => (
            <TouchableOpacity
              key={member.uid}
              accessibilityRole="button"
              style={[styles.chip, selectedUid === member.uid && styles.chipActive]}
              onPress={() => setSelectedUid(member.uid)}
            >
              <Text style={[styles.chipText, selectedUid === member.uid && styles.chipTextActive]}>{member.displayName}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {parents.length ? <Text style={styles.groupLabel}>Parents</Text> : null}
        <View style={styles.chipRow}>
          {parents.map((member) => (
            <TouchableOpacity
              key={member.uid}
              accessibilityRole="button"
              style={[styles.chip, selectedUid === member.uid && styles.chipActive]}
              onPress={() => setSelectedUid(member.uid)}
            >
              <Text style={[styles.chipText, selectedUid === member.uid && styles.chipTextActive]}>{member.displayName}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>Schedule</Text>
        <View style={styles.segmentedRow}>
          {(['once', 'weekdays'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              accessibilityRole="button"
              style={[styles.segmentButton, scheduleMode === mode && styles.segmentButtonActive]}
              onPress={() => setScheduleMode(mode)}
            >
              <Text style={[styles.segmentText, scheduleMode === mode && styles.segmentTextActive]}>
                {mode === 'once' ? 'One time' : 'Weekdays'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {scheduleMode === 'weekdays' ? (
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((weekday) => (
              <TouchableOpacity
                key={weekday.value}
                accessibilityRole="button"
                accessibilityLabel={weekday.label}
                style={[styles.weekdayButton, weekdays.includes(weekday.value) && styles.weekdayButtonActive]}
                onPress={() => toggleWeekday(weekday.value)}
              >
                <Text style={[styles.weekdayText, weekdays.includes(weekday.value) && styles.weekdayTextActive]}>
                  {weekday.short}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TouchableOpacity accessibilityRole="button" style={styles.inputButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.inputButtonText}>{date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity accessibilityRole="button" style={styles.inputButton} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.inputButtonText}>{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
        </TouchableOpacity>

        {showDatePicker ? (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={(_, nextDate) => {
              setShowDatePicker(false);
              if (nextDate) setDate(nextDate);
            }}
          />
        ) : null}
        {showTimePicker ? (
          <DateTimePicker
            value={time}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, nextTime) => {
              if (Platform.OS !== 'ios') setShowTimePicker(false);
              if (nextTime) setTime(nextTime);
            }}
          />
        ) : null}

        {scheduleMode === 'once' && !selectedTemplateId ? (
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saveAsTemplate }}
            style={styles.checkboxRow}
            onPress={() => setSaveAsTemplate((current) => !current)}
          >
            <View style={[styles.checkbox, saveAsTemplate && styles.checkboxActive]}>
              {saveAsTemplate ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <View style={styles.checkboxCopy}>
              <Text style={styles.checkboxTitle}>Save as reusable template</Text>
              <Text style={styles.helperText}>Keep the details for quick assignment later.</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.primaryBtn, saving && styles.disabledBtn]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{scheduleMode === 'weekdays' ? 'Create Routine' : 'Assign Chore'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 120 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  helperText: { marginTop: 4, fontSize: 13, lineHeight: 18, color: '#64748B' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  descriptionInput: { minHeight: 80, textAlignVertical: 'top' },
  inputButton: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  inputButtonText: { color: '#0F172A', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#FFF' },
  groupLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginTop: 14, marginBottom: 8, marginLeft: 4 },
  segmentedRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 4, borderRadius: 12 },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  segmentButtonActive: { backgroundColor: '#FFF' },
  segmentText: { fontWeight: '600', color: '#64748B' },
  segmentTextActive: { color: '#0F172A' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  weekdayButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  weekdayButtonActive: { backgroundColor: '#2563EB' },
  weekdayText: { color: '#64748B', fontWeight: '700' },
  weekdayTextActive: { color: '#FFF' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  checkboxMark: { color: '#FFF', fontWeight: '800' },
  checkboxCopy: { flex: 1, marginLeft: 12 },
  checkboxTitle: { color: '#0F172A', fontWeight: '700' },
  primaryBtn: { marginTop: 24, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#94A3B8' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  templateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  templateRowActive: { backgroundColor: '#EFF6FF' },
  templateCopy: { flex: 1 },
  templateTitle: { color: '#0F172A', fontWeight: '700' },
  templateMeta: { color: '#64748B', fontSize: 12, marginTop: 3 },
  templateUse: { color: '#2563EB', fontWeight: '700', marginLeft: 12 },
  selectedTemplateBanner: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12 },
  selectedTemplateText: { color: '#1D4ED8', fontWeight: '700' },
  clearTemplateText: { color: '#2563EB', fontWeight: '700' },
});
