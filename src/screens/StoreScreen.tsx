import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where
} from '@react-native-firebase/firestore';
import { PointsLog, Profile, Reward } from '../types';
import { RewardCard } from '../components/RewardCard';

interface StoreScreenProps {
  profile: Profile;
  rewards: Reward[];
  familyMembers: Profile[];
}

type AdjustDirection = 'add' | 'remove';

type CollapsibleCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({ title, subtitle, children }) => {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHeader} onPress={() => setOpen(prev => !prev)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
        </View>
        <Text style={styles.cardToggle}>{open ? 'Hide' : 'Show'}</Text>
      </TouchableOpacity>
      {open && <View style={styles.cardBody}>{children}</View>}
    </View>
  );
};

const formatTimestamp = (ts?: any) => {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  return date.toLocaleString();
};

export const StoreScreen: React.FC<StoreScreenProps> = ({ profile, rewards, familyMembers }) => {
  const [rTitle, setRTitle] = useState('');
  const [rPoints, setRPoints] = useState('20');
  const [adjMemberId, setAdjMemberId] = useState<string | null>(null);
  const [adjPoints, setAdjPoints] = useState('0');
  const [adjNote, setAdjNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberLogs, setMemberLogs] = useState<PointsLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsModalVisible, setLogsModalVisible] = useState(false);

  const currentMember = familyMembers.find(m => m.uid === profile.uid);
  const selectedMember = familyMembers.find(m => m.uid === selectedMemberId) || null;
  const adjustMember = familyMembers.find(m => m.uid === adjMemberId) || null;

  useEffect(() => {
    if (!profile?.familyCode || !selectedMemberId) {
      setMemberLogs([]);
      return;
    }

    setLogsLoading(true);
    const logsQuery = query(
      collection(db, 'pointsLogs'),
      where('familyCode', '==', profile.familyCode),
      where('memberUid', '==', selectedMemberId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      logsQuery,
      snap => {
        setMemberLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as PointsLog)));
        setLogsLoading(false);
      },
      err => {
        console.error('Points Logs Listener Error:', err);
        setLogsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [profile?.familyCode, selectedMemberId]);

  useEffect(() => {
    if (profile.role === 'parent' && !adjMemberId && familyMembers.length > 0) {
      setAdjMemberId(familyMembers[0].uid);
    }
  }, [profile.role, familyMembers, adjMemberId]);

  const addReward = async () => {
    if (!rTitle) return;
    try {
      await addDoc(collection(db, 'rewards'), {
        title: rTitle.trim(),
        points: parseInt(rPoints) || 0,
        familyCode: profile.familyCode
      });
      setRTitle('');
      setRPoints('20');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to add reward.');
    }
  };

  const applyAdjustment = async (direction: AdjustDirection) => {
    if (profile.role !== 'parent') return;
    if (!adjustMember) {
      Alert.alert('Select Member', 'Choose a family member first.');
      return;
    }
    if (!adjNote.trim()) {
      Alert.alert('Notes Required', 'Please enter a note for this adjustment.');
      return;
    }

    const rawPoints = Math.abs(parseInt(adjPoints) || 0);
    if (!rawPoints) {
      Alert.alert('Points Required', 'Enter a points value.');
      return;
    }

    setAdjusting(true);
    try {
      await runTransaction(db, async transaction => {
        const memberRef = doc(collection(db, 'members'), adjustMember.uid);
        const logRef = doc(collection(db, 'pointsLogs'));

        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists) throw 'Member does not exist!';

        const currentPoints = ((memberSnap.data() as Profile).points || 0);
        const requestedDelta = direction === 'add' ? rawPoints : -rawPoints;
        const nextPoints = Math.max(0, currentPoints + requestedDelta);
        const appliedDelta = nextPoints - currentPoints;

        if (appliedDelta === 0) throw 'No points to adjust.';

        transaction.update(memberRef, { points: nextPoints });
        transaction.set(logRef, {
          familyCode: adjustMember.familyCode,
          memberUid: adjustMember.uid,
          memberName: adjustMember.displayName,
          pointsDelta: appliedDelta,
          note: adjNote.trim(),
          createdAt: serverTimestamp(),
          createdByUid: profile.uid,
          createdByName: profile.displayName,
          source: 'manual_adjustment'
        });
      });

      setAdjPoints('0');
      setAdjNote('');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update points.');
    } finally {
      setAdjusting(false);
    }
  };

  const handleClaim = (reward: Reward) => {
    Alert.alert('Claimed!', `Go show your parent that you want: ${reward.title}. They will deduct the points once you receive it.`);
  };

  const handleDelete = async (reward: Reward) => {
    Alert.alert('Delete Reward', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(collection(db, 'rewards'), reward.id));
          } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to delete reward.');
          }
        }
      }
    ]);
  };

  const sortedMembers = [...familyMembers].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'parent' ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Store & Points</Text>

      {profile.role === 'parent' && (
        <CollapsibleCard
          title="Quick Adjust Points"
          subtitle="Add or remove points with notes"
        >
          <Text style={styles.inputLabel}>Select Member</Text>
          <View style={styles.memberPicker}>
            {sortedMembers.map(member => {
              const active = member.uid === adjMemberId;
              return (
                <TouchableOpacity
                  key={member.uid}
                  style={[styles.memberChip, active && styles.memberChipActive]}
                  onPress={() => setAdjMemberId(member.uid)}
                >
                  <Text style={[styles.memberChipText, active && styles.memberChipTextActive]}>{member.displayName}</Text>
                  <Text style={[styles.memberChipSub, active && styles.memberChipTextActive]}>{member.points || 0} pts</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.inputLabel}>Points</Text>
          <TextInput
            style={styles.input}
            placeholder="10"
            value={adjPoints}
            onChangeText={setAdjPoints}
            keyboardType="numeric"
          />

          <Text style={styles.inputLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.inputNote]}
            placeholder="Why are you adjusting points?"
            value={adjNote}
            onChangeText={setAdjNote}
            multiline
            numberOfLines={3}
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSpacer, adjusting && styles.actionBtnDisabled]}
              onPress={() => applyAdjustment('add')}
              disabled={adjusting}
            >
              <Text style={styles.actionBtnText}>Add Points</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDanger, adjusting && styles.actionBtnDisabled]}
              onPress={() => applyAdjustment('remove')}
              disabled={adjusting}
            >
              <Text style={[styles.actionBtnText, styles.actionBtnTextLight]}>Remove Points</Text>
            </TouchableOpacity>
          </View>
        </CollapsibleCard>
      )}

      {profile.role === 'child' && (
        <CollapsibleCard title="Your Wallet" subtitle="Tap to view your points">
          <View style={[styles.walletCard, { backgroundColor: '#2563EB', alignItems: 'center' }]}>
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Your Wallet</Text>
            <Text style={{ color: '#FFF', fontSize: 48, fontWeight: '900' }}>{currentMember?.points || 0}</Text>
            <Text style={{ color: '#BFDBFE', fontSize: 14 }}>Total Points</Text>
          </View>
        </CollapsibleCard>
      )}

      {profile.role === 'parent' && (
        <CollapsibleCard title="Manage Rewards" subtitle="Create new rewards">
          <TextInput style={styles.input} placeholder="Reward Name" value={rTitle} onChangeText={setRTitle} />
          <TextInput
            style={styles.input}
            placeholder="Points Cost"
            value={rPoints}
            onChangeText={setRPoints}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.secondaryBtn} onPress={addReward}>
            <Text style={styles.secondaryBtnText}>Add New Reward</Text>
          </TouchableOpacity>
        </CollapsibleCard>
      )}

      <CollapsibleCard title="Family Points" subtitle="Tap a member to view their points log">
        {sortedMembers.length === 0 && <Text style={styles.emptyText}>No family members yet.</Text>}
        {sortedMembers.map(member => {
          return (
            <TouchableOpacity
              key={member.uid}
              style={styles.memberRow}
              onPress={() => {
                setSelectedMemberId(member.uid);
                setLogsModalVisible(true);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{member.displayName}</Text>
                <Text style={styles.memberRole}>{member.role === 'parent' ? 'Parent' : 'Child'}</Text>
              </View>
              <Text style={styles.memberPoints}>{member.points || 0} Pts</Text>
            </TouchableOpacity>
          );
        })}
      </CollapsibleCard>

      <CollapsibleCard title="Available Rewards" subtitle="Redeem points for rewards">
        {rewards.length === 0 && <Text style={styles.emptyText}>No rewards added yet.</Text>}
        {rewards.map(r => (
          <RewardCard
            key={r.id}
            reward={r}
            profile={profile}
            currentMember={currentMember}
            onClaim={handleClaim}
            onDelete={handleDelete}
          />
        ))}
      </CollapsibleCard>

      <View style={{ height: 100 }} />

      <Modal
        visible={logsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLogsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedMember ? `Points Log: ${selectedMember.displayName}` : "Points Log"}
              </Text>
              <TouchableOpacity onPress={() => setLogsModalVisible(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {logsLoading && <Text style={styles.mutedText}>Loading...</Text>}
              {!logsLoading && memberLogs.length === 0 && (
                <Text style={styles.emptyText}>No points activity yet.</Text>
              )}
              {!logsLoading && memberLogs.length > 0 && (
                <View>
                  {memberLogs.map(log => {
                    const delta = log.pointsDelta || 0;
                    const deltaLabel = delta > 0 ? `+${delta} pts` : `${delta} pts`;
                    return (
                      <View key={log.id} style={styles.logRow}>
                        <Text style={[styles.logDelta, delta < 0 && styles.logDeltaNegative]}>{deltaLabel}</Text>
                        {!!log.note && <Text style={styles.logNote}>{log.note}</Text>}
                        <Text style={styles.logMeta}>
                          By {log.createdByName || 'Unknown'} - {formatTimestamp(log.createdAt)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  cardSubtitle: { marginTop: 4, color: '#64748B', fontSize: 12 },
  cardToggle: { color: '#2563EB', fontWeight: '700', marginLeft: 12 },
  cardBody: { paddingHorizontal: 16, paddingBottom: 16 },
  walletCard: { borderRadius: 16, padding: 20, width: '100%' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  inputNote: { height: 90, textAlignVertical: 'top' },
  secondaryBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  secondaryBtnText: { color: '#0F172A', fontWeight: '600' },
  emptyText: { fontStyle: 'italic', color: '#94A3B8', textAlign: 'center', marginTop: 8 },
  mutedText: { color: '#94A3B8', marginTop: 8 },
  actionRow: { flexDirection: 'row' },
  actionBtn: { flex: 1, backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  actionBtnSpacer: { marginRight: 12 },
  actionBtnDanger: { backgroundColor: '#EF4444' },
  actionBtnText: { color: '#F8FAFC', fontWeight: '700' },
  actionBtnTextLight: { color: '#FFF' },
  actionBtnDisabled: { opacity: 0.6 },
  memberPicker: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  memberChip: { backgroundColor: '#F1F5F9', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8, marginBottom: 8 },
  memberChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  memberChipText: { color: '#0F172A', fontWeight: '600' },
  memberChipSub: { color: '#64748B', fontSize: 11 },
  memberChipTextActive: { color: '#EFF6FF' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  memberRowActive: { backgroundColor: '#F8FAFC' },
  memberName: { fontWeight: '700', color: '#0F172A' },
  memberRole: { color: '#64748B', fontSize: 12 },
  memberPoints: { fontWeight: '800', color: '#10B981' },
  logSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  logTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  logRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  logDelta: { fontWeight: '800', color: '#10B981', marginBottom: 2 },
  logDeltaNegative: { color: '#EF4444' },
  logNote: { color: '#0F172A' },
  logMeta: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  modalClose: { color: '#2563EB', fontWeight: '600' }
});

