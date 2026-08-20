import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Chore, ChoreTemplate, FamilySettings, Profile, Reward } from '../types';
import { buildFamilySettings } from '../utils/familySettings';
import { normalizeName } from '../utils/nameMatch';

export function useFamilyData(profile: Profile | null) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [choreTemplates, setChoreTemplates] = useState<ChoreTemplate[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Profile[]>([]);
  const [privatePushTokens, setPrivatePushTokens] = useState<Record<string, string>>({});
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [familySettings, setFamilySettings] = useState<FamilySettings>(() =>
    buildFamilySettings(profile?.familyCode || "")
  );
  const [loading, setLoading] = useState(true);
  const backfillProcessed = useRef<Set<string>>(new Set());

  const familyMembers = useMemo(
    () => memberProfiles.map((member) => ({
      ...member,
      pushToken: profile?.role === "parent" ? privatePushTokens[member.uid] : undefined,
    })),
    [memberProfiles, privatePushTokens, profile?.role]
  );

  useEffect(() => {
    if (!profile?.familyCode) {
      setChores([]);
      setChoreTemplates([]);
      setMemberProfiles([]);
      setPrivatePushTokens({});
      setRewards([]);
      setFamilySettings(buildFamilySettings(""));
      setLoading(false);
      return;
    }

    setLoading(true);
    setChores([]);
    setChoreTemplates([]);
    setMemberProfiles([]);
    setPrivatePushTokens({});
    setRewards([]);
    setFamilySettings(buildFamilySettings(profile.familyCode));

    const choreBuckets = new Map<string, Chore[]>();
    const choreUnsubscribes: Array<() => void> = [];
    const updateChoreBucket = (bucket: string, nextChores: Chore[]) => {
      choreBuckets.set(bucket, nextChores);
      const merged = new Map<string, Chore>();
      choreBuckets.forEach((items) => items.forEach((chore) => merged.set(chore.id, chore)));
      setChores(
        Array.from(merged.values()).sort((a, b) => {
          const aMillis = a.createdAt?.toMillis?.() ?? a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const bMillis = b.createdAt?.toMillis?.() ?? b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return bMillis - aMillis;
        })
      );
    };
    const subscribeToChores = (bucket: string, choresQuery: ReturnType<typeof query>) => {
      choreUnsubscribes.push(onSnapshot(
        choresQuery,
        (snap) => updateChoreBucket(
          bucket,
          snap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Chore, "id">),
          }))
        ),
        (error) => console.error(`Chores Listener Error (${bucket}):`, error)
      ));
    };

    if (profile.role === "parent") {
      subscribeToChores("family", query(
        collection(db, "chores"),
        where("familyCode", "==", profile.familyCode),
        where("archivedAt", "==", null),
        orderBy("createdAt", "desc")
      ));
    } else {
      subscribeToChores("assigned", query(
        collection(db, "chores"),
        where("familyCode", "==", profile.familyCode),
        where("archivedAt", "==", null),
        where("assignedToUid", "==", profile.uid)
      ));
      subscribeToChores("legacy", query(
        collection(db, "chores"),
        where("familyCode", "==", profile.familyCode),
        where("archivedAt", "==", null),
        where("assignedToUid", "==", null),
        where("assignedTo", "==", profile.displayName)
      ));
      subscribeToChores("bounties", query(
        collection(db, "chores"),
        where("familyCode", "==", profile.familyCode),
        where("archivedAt", "==", null),
        where("assignedToUid", "==", null),
        where("isBounty", "==", true)
      ));
    }

    const unsubscribeMembers = profile.role === "parent"
      ? onSnapshot(
          query(
            collection(db, "members"),
            where("familyCode", "==", profile.familyCode)
          ),
          (snap) => {
            setMemberProfiles(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Profile)));
          },
          err => console.error("Members Listener Error:", err)
        )
      : onSnapshot(
          doc(collection(db, "members"), profile.uid),
          (snap) => {
            setMemberProfiles(
              snap.exists ? [{ uid: snap.id, ...snap.data() } as Profile] : []
            );
          },
          err => console.error("Member Listener Error:", err)
        );

    const unsubscribePrivateMembers = profile.role === "parent"
      ? onSnapshot(
          query(
            collection(db, "memberPrivate"),
            where("familyCode", "==", profile.familyCode)
          ),
          (snap) => {
            const tokens: Record<string, string> = {};
            snap.docs.forEach((item) => {
              const pushToken = item.data()?.pushToken;
              if (typeof pushToken === "string" && pushToken) {
                tokens[item.id] = pushToken;
              }
            });
            setPrivatePushTokens(tokens);
          },
          (error) => console.error("Private Members Listener Error:", error)
        )
      : () => undefined;

    const templatesQuery = query(
      collection(db, "choreTemplates"),
      where("familyCode", "==", profile.familyCode)
    );

    const unsubscribeTemplates = profile.role === "parent"
      ? onSnapshot(templatesQuery, (snap) => {
          setChoreTemplates(
            snap.docs
              .map(d => ({ id: d.id, ...d.data() } as ChoreTemplate))
              .sort((a, b) => a.title.localeCompare(b.title, "en"))
          );
        }, err => console.error("Chore Templates Listener Error:", err))
      : () => undefined;

    const rewardsQuery = query(
      collection(db, "rewards"),
      where("familyCode", "==", profile.familyCode)
    );

    const familySettingsRef = doc(collection(db, "families"), profile.familyCode);

    const unsubscribeRewards = onSnapshot(rewardsQuery, (snap) => {
      setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reward)));
      setLoading(false);
    }, err => console.error("Rewards Listener Error:", err));

    const unsubscribeFamilySettings = onSnapshot(familySettingsRef, (snap) => {
      setFamilySettings(
        buildFamilySettings(profile.familyCode, snap.exists ? (snap.data() as FamilySettings) : null)
      );
    }, err => console.error("Family Settings Listener Error:", err));

    return () => {
      choreUnsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribeMembers();
      unsubscribePrivateMembers();
      unsubscribeTemplates();
      unsubscribeRewards();
      unsubscribeFamilySettings();
    };
  }, [profile?.displayName, profile?.familyCode, profile?.role, profile?.uid]);

  useEffect(() => {
    if (!profile?.familyCode) return;
    if (profile.role !== 'parent') return;
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
  }, [chores, familyMembers, profile?.familyCode, profile?.role]);

  return { chores, choreTemplates, familyMembers, rewards, familySettings, loading };
}
