import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chore, Profile } from '../types';
import { namesMatch } from '../utils/nameMatch';
import { toDate } from '../utils/date';

interface ParentDashboardProps {
  profile: Profile;
  chores: Chore[];
  familyMembers: Profile[];
  onPressChore: (chore: Chore) => void;
  onApprove: (chore: Chore) => Promise<void>;
  decidingChoreId?: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; order: number }> = {
  submitted: { color: '#2563EB', label: 'Awaiting review', order: 0 },
  redo: { color: '#EF4444', label: 'Needs redo', order: 1 },
  in_progress: { color: '#F59E0B', label: 'In progress', order: 2 },
  pending: { color: '#64748B', label: 'Not started', order: 3 },
  approved: { color: '#10B981', label: 'Approved', order: 4 },
};

const dueAtMs = (chore: Chore) => toDate(chore.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;

const formatDue = (chore: Chore) => {
  const dueAt = toDate(chore.dueAt);
  if (!dueAt) return 'No deadline';
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  if (dueAt.getTime() < now.getTime() && !sameDay(dueAt, now)) return `Overdue · ${dueAt.toLocaleDateString()}`;
  if (sameDay(dueAt, now)) return `Today · ${dueAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (sameDay(dueAt, tomorrow)) return `Tomorrow · ${dueAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return dueAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const sortChores = (left: Chore, right: Chore) => {
  const statusDifference = (STATUS_CONFIG[left.status]?.order ?? 9) - (STATUS_CONFIG[right.status]?.order ?? 9);
  if (statusDifference) return statusDifference;
  const dueDifference = dueAtMs(left) - dueAtMs(right);
  if (dueDifference) return dueDifference;
  return left.title.localeCompare(right.title, 'en');
};

export const ParentDashboard: React.FC<ParentDashboardProps> = ({
  profile,
  chores,
  familyMembers,
  onPressChore,
  onApprove,
  decidingChoreId,
}) => {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const submitted = useMemo(
    () => chores.filter((chore) => chore.status === 'submitted').sort(sortChores),
    [chores]
  );
  const myChores = useMemo(
    () => chores
      .filter((chore) => chore.status !== 'approved')
      .filter((chore) => chore.assignedToUid
        ? chore.assignedToUid === profile.uid
        : namesMatch(chore.assignedTo, profile.displayName))
      .sort(sortChores),
    [chores, profile.displayName, profile.uid]
  );
  const bounties = useMemo(
    () => chores
      .filter((chore) => chore.isBounty && !chore.assignedToUid && !['approved', 'submitted'].includes(chore.status))
      .sort(sortChores),
    [chores]
  );
  const childSections = useMemo(
    () => familyMembers
      .filter((member) => member.role === 'child')
      .map((member) => ({
        member,
        chores: chores
          .filter((chore) => !chore.isBounty)
          .filter((chore) => chore.assignedToUid ? chore.assignedToUid === member.uid : namesMatch(chore.assignedTo, member.displayName))
          .sort(sortChores),
      }))
      .filter((section) => section.chores.length),
    [chores, familyMembers]
  );
  const openChores = chores.filter((chore) => !['approved', 'submitted'].includes(chore.status));
  const overdueCount = openChores.filter((chore) => nowMs > 0 && dueAtMs(chore) < nowMs).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Parent Review</Text>

      <View style={[styles.section, styles.myChoresSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Chores</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{myChores.length}</Text>
          </View>
        </View>
        <Text style={styles.sectionHelper}>Tap a chore to check its steps, attach proof, and submit it.</Text>
        {myChores.length ? myChores.map((chore) => {
          const status = STATUS_CONFIG[chore.status] || STATUS_CONFIG.pending;
          return (
            <TouchableOpacity
              key={chore.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${chore.title}, ${status.label}`}
              style={styles.choreRow}
              onPress={() => onPressChore(chore)}
            >
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <View style={styles.choreCopy}>
                <Text style={styles.rowTitle}>{chore.title}</Text>
                <Text style={styles.rowMeta}>{formatDue(chore)} · {chore.points} pts</Text>
              </View>
              <Text style={[styles.rowStatus, { color: status.color }]}>{status.label}</Text>
            </TouchableOpacity>
          );
        }) : <Text style={styles.emptyText}>You have no assigned chores right now.</Text>}
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summarySpacer]}>
          <Text style={styles.summaryValue}>{submitted.length}</Text>
          <Text style={styles.summaryLabel}>Ready to approve</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, overdueCount > 0 && styles.overdueValue]}>{overdueCount}</Text>
          <Text style={styles.summaryLabel}>Overdue</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Awaiting Approval</Text>
        <Text style={styles.sectionHelper}>Approve in one tap, or open the chore to review proof and send specific redo feedback.</Text>
        {submitted.length ? submitted.map((chore) => {
          const busy = decidingChoreId === chore.id;
          return (
            <View key={chore.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewCopy}>
                  <Text style={styles.choreTitle}>{chore.title}</Text>
                  <Text style={styles.choreMeta}>{chore.completedBy || chore.assignedTo} · {chore.points} pts · {formatDue(chore)}</Text>
                </View>
                <View style={styles.submittedPill}>
                  <Text style={styles.submittedPillText}>Ready</Text>
                </View>
              </View>
              <View style={styles.reviewActions}>
                <TouchableOpacity accessibilityRole="button" style={styles.reviewButton} onPress={() => onPressChore(chore)}>
                  <Text style={styles.reviewButtonText}>Review / Redo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.approveButton, busy && styles.disabledButton]}
                  disabled={busy}
                  onPress={() => onApprove(chore)}
                >
                  {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.approveButtonText}>Approve +{chore.points}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          );
        }) : <Text style={styles.emptyText}>Nothing is waiting for review.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Required Chores</Text>
        {childSections.length ? childSections.map(({ member, chores: memberChores }) => (
          <View key={member.uid} style={styles.childSection}>
            <View style={styles.childHeader}>
              <View>
                <Text style={styles.childName}>{member.displayName}</Text>
                <Text style={styles.childConsistency}>
                  {member.weeklyConsistency?.completedDays?.length || 0}/{member.weeklyConsistency?.goalDays || 5} consistency days
                </Text>
              </View>
              <Text style={styles.choreCount}>{memberChores.length} chores</Text>
            </View>
            {memberChores.map((chore) => {
              const status = STATUS_CONFIG[chore.status] || STATUS_CONFIG.pending;
              return (
                <TouchableOpacity
                  key={chore.id}
                  accessibilityRole="button"
                  style={styles.choreRow}
                  onPress={() => onPressChore(chore)}
                >
                  <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                  <View style={styles.choreCopy}>
                    <Text style={styles.rowTitle}>{chore.title}</Text>
                    <Text style={styles.rowMeta}>{formatDue(chore)}</Text>
                  </View>
                  <Text style={[styles.rowStatus, { color: status.color }]}>{status.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )) : <Text style={styles.emptyText}>No required chores assigned yet.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Optional Bounties</Text>
        {bounties.length ? bounties.map((chore) => (
          <TouchableOpacity
            key={chore.id}
            accessibilityRole="button"
            style={styles.choreRow}
            onPress={() => onPressChore(chore)}
          >
            <View style={[styles.statusDot, styles.bountyDot]} />
            <View style={styles.choreCopy}>
              <Text style={styles.rowTitle}>{chore.title}</Text>
              <Text style={styles.rowMeta}>{formatDue(chore)}</Text>
            </View>
            <Text style={styles.bountyPoints}>+{chore.points} pts</Text>
          </TouchableOpacity>
        )) : <Text style={styles.emptyText}>No optional bounties right now.</Text>}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 120 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  myChoresSection: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countPill: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
  countPillText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', marginTop: 18 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  summarySpacer: { marginRight: 12 },
  summaryValue: { fontSize: 28, fontWeight: '800', color: '#2563EB' },
  overdueValue: { color: '#EF4444' },
  summaryLabel: { color: '#64748B', fontSize: 12, marginTop: 2 },
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginTop: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  sectionHelper: { color: '#64748B', fontSize: 13, lineHeight: 18, marginTop: 5, marginBottom: 8 },
  reviewCard: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  reviewCopy: { flex: 1 },
  choreTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  choreMeta: { color: '#64748B', fontSize: 12, marginTop: 4 },
  submittedPill: { backgroundColor: '#DBEAFE', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8 },
  submittedPillText: { color: '#1D4ED8', fontSize: 11, fontWeight: '700' },
  reviewActions: { flexDirection: 'row', marginTop: 12 },
  reviewButton: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10, alignItems: 'center', paddingVertical: 11, marginRight: 8 },
  reviewButtonText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  approveButton: { flex: 1, backgroundColor: '#10B981', borderRadius: 10, alignItems: 'center', paddingVertical: 11 },
  approveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  disabledButton: { opacity: 0.6 },
  emptyText: { color: '#94A3B8', fontStyle: 'italic', marginTop: 12 },
  childSection: { marginTop: 16 },
  childHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  childName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  childConsistency: { color: '#64748B', fontSize: 12, marginTop: 2 },
  choreCount: { color: '#94A3B8', fontSize: 12 },
  choreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  bountyDot: { backgroundColor: '#8B5CF6' },
  choreCopy: { flex: 1 },
  rowTitle: { color: '#0F172A', fontWeight: '600' },
  rowMeta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  rowStatus: { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  bountyPoints: { color: '#8B5CF6', fontWeight: '800', marginLeft: 8 },
});
