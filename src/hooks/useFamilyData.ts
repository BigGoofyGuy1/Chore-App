import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc,
  query, 
  updateDoc,
  where, 
  orderBy, 
  onSnapshot 
} from '@react-native-firebase/firestore';
import { db } from '../firebase';
import { Chore, Profile, Reward } from '../types';
import { normalizeName } from '../utils/nameMatch';

export function useFamilyData(profile: Profile | null) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [familyMembers, setFamilyMembers] = useState<Profile[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const backfillProcessed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.familyCode) {
      setLoading(false);
      return;
    }

    const choresQuery = query(
      collection(db, "chores"),
      where("familyCode", "==", profile.familyCode),
      where("archivedAt", "==", null),
      orderBy("createdAt", "desc")
    );

    const unsubscribeChores = onSnapshot(choresQuery, (snap) => {
      setChores(snap.docs.map(d => ({ id: d.id, ...d.data() } as Chore)));
    }, err => console.error("Chores Listener Error:", err));

    const membersQuery = query(
      collection(db, "members"),
      where("familyCode", "==", profile.familyCode)
    );

    const unsubscribeMembers = onSnapshot(membersQuery, (snap) => {
      setFamilyMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Profile)));
    }, err => console.error("Members Listener Error:", err));

    const rewardsQuery = query(
      collection(db, "rewards"),
      where("familyCode", "==", profile.familyCode)
    );

    const unsubscribeRewards = onSnapshot(rewardsQuery, (snap) => {
      setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reward)));
      setLoading(false);
    }, err => console.error("Rewards Listener Error:", err));

    return () => {
      unsubscribeChores();
      unsubscribeMembers();
      unsubscribeRewards();
    };
  }, [profile?.familyCode]);

  useEffect(() => {
    if (!profile?.familyCode) return;
    if (!familyMembers.length || !chores.length) return;

    const memberByName = new Map<string, Profile>();
    familyMembers.forEach((m) => {
      const key = normalizeName(m.displayName);
      if (key && !memberByName.has(key)) {
        memberByName.set(key, m);
      }
    });

    const updates: Promise<unknown>[] = [];

    chores.forEach((chore) => {
      if (chore.assignedToUid) return;
      if (chore.isBounty) return;
      if (backfillProcessed.current.has(chore.id)) return;
      const key = normalizeName(chore.assignedTo);
      if (!key || key === "anyone") return;
      const member = memberByName.get(key);
      if (!member) return;

      backfillProcessed.current.add(chore.id);
      const update: Partial<Chore> = { assignedToUid: member.uid };
      const normalizedAssignedTo = member.displayName?.trim();
      if (normalizedAssignedTo && chore.assignedTo !== normalizedAssignedTo) {
        update.assignedTo = normalizedAssignedTo;
      }
      updates.push(updateDoc(doc(collection(db, "chores"), chore.id), update));
    });

    if (updates.length) {
      Promise.allSettled(updates).catch((e) => {
        console.error("Backfill assignedToUid failed:", e);
      });
    }
  }, [chores, familyMembers, profile?.familyCode]);

  return { chores, familyMembers, rewards, loading };
}
