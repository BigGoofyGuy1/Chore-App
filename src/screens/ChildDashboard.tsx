import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chore, Profile, Reward } from '../types';
import { ChoreCard } from '../components/ChoreCard';
import { ChoreDateScope, isDueInScope, toDate } from '../utils/date';
import { namesMatch } from '../utils/nameMatch';
import { buildWeeklyConsistency } from '../utils/schedule';

interface ChildDashboardProps {
  profile: Profile;
  chores: Chore[];
  rewards: Reward[];
  familyMembers: Profile[];
  scope: ChoreDateScope;
  onPressChore: (chore: Chore) => void;
}

const FINISHED_STATUSES = new Set(['submitted', 'approved']);

const statusOrder: Record<string, number> = {
  redo: 0,
  in_progress: 1,
  pending: 2,
  submitted: 3,
  approved: 4,
};

const sortRequiredChores = (left: Chore, right: Chore) => {
  const statusDifference = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9);
  if (statusDifference) return statusDifference;
  const leftDue = toDate(left.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightDue = toDate(right.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return left.title.localeCompare(right.title, 'en');
};

const friendlyDue = (chore: Chore) => {
  const dueAt = toDate(chore.dueAt);
  if (!dueAt) return 'No deadline';
  const now = new Date();
  if (dueAt.getTime() < now.getTime()) return 'Ready now';
  return `Due ${dueAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

export const ChildDashboard: React.FC<ChildDashboardProps> = ({
  profile,
  chores,
  rewards,
  familyMembers,
  scope,
  onPressChore,
}) => {
  const [bountiesOpen, setBountiesOpen] = useState(false);
  const [hiddenChoreIds, setHiddenChoreIds] = useState<Record<string, true>>({});

  const currentMember = familyMembers.find((member) => member.uid === profile.uid) || profile;
  const consistency = buildWeeklyConsistency(currentMember.weeklyConsistency);
  const pinnedReward = rewards.find((reward) => reward.id === currentMember.pinnedRewardId) || null;
  const rewardProgress = pinnedReward
    ? Math.min(100, Math.round(((currentMember.points || 0) / pinnedReward.points) * 100))
    : 0;

  const assignedRequired = useMemo(
    () => chores
      .filter((chore) => !chore.isBounty && chore.required !== false)
      .filter((chore) => chore.assignedToUid ? chore.assignedToUid === profile.uid : namesMatch(chore.assignedTo, profile.displayName))
      .filter((chore) => isDueInScope(chore.dueAt, scope))
      .sort(sortRequiredChores),
    [chores, profile.uid, profile.displayName, scope]
  );

  const bounties = useMemo(
    () => chores
      .filter((chore) => chore.isBounty)
      .filter((chore) => !chore.assignedToUid)
      .filter((chore) => !FINISHED_STATUSES.has(chore.status))
      .filter((chore) => isDueInScope(chore.dueAt, scope))
      .sort((left, right) => left.title.localeCompare(right.title, 'en')),
    [chores, scope]
  );

  const dailyThree = assignedRequired.slice(0, 3);
  const dailyFinishedCount = dailyThree.filter((chore) => FINISHED_STATUSES.has(chore.status)).length;
  const nextChore = dailyThree.find((chore) => !FINISHED_STATUSES.has(chore.status)) || null;
  const remainingDailyCards = dailyThree.filter((chore) => chore.id !== nextChore?.id && !hiddenChoreIds[chore.id]);
  const additionalRequired = assignedRequired.slice(3).filter((chore) => !hiddenChoreIds[chore.id]);
  const requiredComplete = assignedRequired.every((chore) => FINISHED_STATUSES.has(chore.status));
  const dailyTotal = dailyThree.length;
  const dailyProgress = dailyTotal ? Math.round((dailyFinishedCount / dailyTotal) * 100) : 100;

  const hideChore = (id: string) => {
    setHiddenChoreIds((current) => current[id] ? current : { ...current, [id]: true });
  };

  const renderChoreCard = (chore: Chore) => (
    <ChoreCard
      key={chore.id}
      chore={chore}
      onPress={() => onPressChore(chore)}
      onCelebrationComplete={() => hideChore(chore.id)}
    />
  );

  if (scope === 'week') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Week</Text>
        <Text style={styles.scopeLabel}>Required chores come first</Text>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Required</Text>
          <Text style={styles.sectionCount}>{assignedRequired.length}</Text>
        </View>
        {assignedRequired.length ? assignedRequired.filter((chore) => !hiddenChoreIds[chore.id]).map(renderChoreCard) : (
          <Text style={styles.emptyText}>No required chores in the next seven days.</Text>
        )}
        <View style={styles.bountySection}>
          <TouchableOpacity accessibilityRole="button" style={styles.sectionHeader} onPress={() => setBountiesOpen((current) => !current)}>
            <Text style={styles.sectionTitle}>Optional Bounties</Text>
            <Text style={styles.sectionLink}>{bountiesOpen ? 'Hide' : `Show ${bounties.length}`}</Text>
          </TouchableOpacity>
          {bountiesOpen ? bounties.map(renderChoreCard) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hi, {profile.displayName} 👋</Text>
      <Text style={styles.title}>My Daily 3</Text>

      <View style={styles.dailyCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{dailyFinishedCount} of {dailyTotal || 0} finished</Text>
          <Text style={styles.progressPercent}>{dailyProgress}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${dailyProgress}%` }]} />
        </View>

        {nextChore ? (
          <View style={styles.nextCard}>
            <Text style={styles.nextEyebrow}>{nextChore.status === 'redo' ? 'TRY THIS ONE AGAIN' : 'NEXT UP'}</Text>
            <Text style={styles.nextTitle}>{nextChore.title}</Text>
            <Text style={styles.nextMeta}>{friendlyDue(nextChore)} · {nextChore.points} points</Text>
            {nextChore.feedback ? <Text style={styles.redoFeedback}>{nextChore.feedback}</Text> : null}
            <TouchableOpacity accessibilityRole="button" style={styles.startButton} onPress={() => onPressChore(nextChore)}>
              <Text style={styles.startButtonText}>{nextChore.status === 'in_progress' ? 'Keep Going' : 'Start Chore'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.completeCard}>
            <Text style={styles.completeEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>Required chores complete!</Text>
            <Text style={styles.completeText}>{bounties.length ? 'Optional bounties are now unlocked.' : 'You are done for today.'}</Text>
          </View>
        )}
      </View>

      {remainingDailyCards.length ? (
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Also in today&apos;s three</Text>
          {remainingDailyCards.map(renderChoreCard)}
        </View>
      ) : null}

      {additionalRequired.length ? (
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>More required chores</Text>
          <Text style={styles.sectionHelper}>Finish these before optional bounties unlock.</Text>
          {additionalRequired.map(renderChoreCard)}
        </View>
      ) : null}

      <View style={styles.motivationRow}>
        <View style={[styles.motivationCard, styles.motivationSpacer]}>
          <Text style={styles.motivationEyebrow}>THIS WEEK</Text>
          <Text style={styles.motivationValue}>{consistency.completedDays.length}/{consistency.goalDays} days</Text>
          <View style={styles.smallProgressTrack}>
            <View
              style={[
                styles.consistencyFill,
                { width: `${Math.min(100, (consistency.completedDays.length / consistency.goalDays) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.motivationHelper}>
            {consistency.bonusAwarded ? `Bonus earned: +${consistency.bonusPoints}` : `Earn +${consistency.bonusPoints} at ${consistency.goalDays} days`}
          </Text>
        </View>

        <View style={styles.motivationCard}>
          <Text style={styles.motivationEyebrow}>REWARD GOAL</Text>
          {pinnedReward ? (
            <>
              <Text style={styles.rewardTitle} numberOfLines={2}>{pinnedReward.title}</Text>
              <View style={styles.smallProgressTrack}>
                <View style={[styles.rewardFill, { width: `${rewardProgress}%` }]} />
              </View>
              <Text style={styles.motivationHelper}>{currentMember.points || 0}/{pinnedReward.points} points</Text>
            </>
          ) : (
            <Text style={styles.motivationHelper}>Pin a reward in the Store to track it here.</Text>
          )}
        </View>
      </View>

      <View style={[styles.bountySection, !requiredComplete && styles.lockedSection]}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.sectionHeader}
          disabled={!requiredComplete}
          onPress={() => setBountiesOpen((current) => !current)}
        >
          <View>
            <Text style={styles.sectionTitle}>Optional Bounties</Text>
            {!requiredComplete ? <Text style={styles.lockedText}>🔒 Finish required chores to unlock</Text> : null}
          </View>
          {requiredComplete ? <Text style={styles.sectionLink}>{bountiesOpen ? 'Hide' : `Show ${bounties.length}`}</Text> : null}
        </TouchableOpacity>
        {requiredComplete && bountiesOpen ? (
          bounties.length ? bounties.map(renderChoreCard) : <Text style={styles.emptyText}>No bounties right now.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 36, paddingBottom: 120 },
  greeting: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginTop: 3 },
  scopeLabel: { color: '#64748B', marginTop: 4, marginBottom: 20 },
  dailyCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginTop: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: '#334155', fontWeight: '700' },
  progressPercent: { color: '#2563EB', fontWeight: '800' },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: '#E2E8F0', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: '#2563EB' },
  nextCard: { backgroundColor: '#EFF6FF', borderRadius: 16, padding: 18, marginTop: 18, borderWidth: 1, borderColor: '#BFDBFE' },
  nextEyebrow: { color: '#2563EB', fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  nextTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginTop: 7 },
  nextMeta: { color: '#64748B', marginTop: 5 },
  redoFeedback: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 10, borderRadius: 10, marginTop: 10 },
  startButton: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  startButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  completeCard: { alignItems: 'center', paddingVertical: 22 },
  completeEmoji: { fontSize: 34 },
  completeTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  completeText: { color: '#64748B', marginTop: 5, textAlign: 'center' },
  listSection: { marginTop: 22 },
  sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  sectionHelper: { color: '#64748B', fontSize: 13, marginTop: -7, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionCount: { color: '#64748B', fontWeight: '700' },
  sectionLink: { color: '#2563EB', fontWeight: '700' },
  bountySection: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  lockedSection: { backgroundColor: '#F8FAFC' },
  lockedText: { color: '#94A3B8', fontSize: 12, marginTop: -7 },
  emptyText: { color: '#94A3B8', fontStyle: 'italic', marginBottom: 12 },
  motivationRow: { flexDirection: 'row', marginTop: 20 },
  motivationCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', minHeight: 142 },
  motivationSpacer: { marginRight: 12 },
  motivationEyebrow: { color: '#64748B', fontSize: 10, letterSpacing: 0.8, fontWeight: '800' },
  motivationValue: { color: '#0F172A', fontSize: 20, fontWeight: '800', marginTop: 8 },
  rewardTitle: { color: '#0F172A', fontSize: 15, lineHeight: 19, fontWeight: '800', marginTop: 8 },
  smallProgressTrack: { height: 7, borderRadius: 4, backgroundColor: '#E2E8F0', overflow: 'hidden', marginTop: 10 },
  consistencyFill: { height: '100%', backgroundColor: '#10B981' },
  rewardFill: { height: '100%', backgroundColor: '#F59E0B' },
  motivationHelper: { color: '#64748B', fontSize: 11, lineHeight: 15, marginTop: 8 },
});
