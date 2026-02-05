import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from '@react-native-firebase/firestore';
import { db } from '../firebase';
import { Chore, Profile, Reward } from '../types';

export function useFamilyData(profile: Profile | null) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [familyMembers, setFamilyMembers] = useState<Profile[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.familyCode) {
      setLoading(false);
      return;
    }

    const choresQuery = query(
      collection(db, "chores"),
      where("familyCode", "==", profile.familyCode),
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

  return { chores, familyMembers, rewards, loading };
}
