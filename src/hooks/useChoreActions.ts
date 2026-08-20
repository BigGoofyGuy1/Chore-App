import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, collection, updateDoc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import { getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { db, storage } from '../firebase';
import { Chore, Profile } from '../types';
import { sendPushNotification, triggerHapticSuccess } from '../utils/sendPushNotification';
import { namesMatch } from '../utils/nameMatch';
import { buildWeeklyConsistency, dateKey } from '../utils/schedule';
import { notifyChoreSubmitted } from '../utils/callableFunctions';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useChoreActions(profile: Profile | null, familyMembers: Profile[]) {
  const [uploading, setUploading] = useState(false);
  const [decidingChoreId, setDecidingChoreId] = useState<string | null>(null);

  const recordConsistencyDay = async (memberUid: string) => {
    if (!profile) return 0;

    return runTransaction(db, async (transaction) => {
      const memberRef = doc(collection(db, "members"), memberUid);
      const memberSnap = await transaction.get(memberRef);
      if (!memberSnap.exists) throw new Error("Member does not exist.");

      const member = { uid: memberSnap.id, ...memberSnap.data() } as Profile;
      const now = new Date();
      const current = buildWeeklyConsistency(member.weeklyConsistency, now);
      const completedDays = Array.from(new Set([...current.completedDays, dateKey(now)])).sort();
      const earnedBonus = !current.bonusAwarded && completedDays.length >= current.goalDays;
      const nextConsistency = {
        ...current,
        completedDays,
        bonusAwarded: current.bonusAwarded || earnedBonus,
      };

      if (earnedBonus) {
        const bonusLogRef = doc(
          collection(db, "pointsLogs"),
          `weekly_consistency_${memberUid}_${current.weekKey}`
        );
        const bonusLogSnap = await transaction.get(bonusLogRef);
        if (!bonusLogSnap.exists) {
          transaction.update(memberRef, {
            weeklyConsistency: nextConsistency,
            points: (member.points || 0) + current.bonusPoints,
          });
          transaction.set(bonusLogRef, {
            familyCode: member.familyCode,
            memberUid: member.uid,
            memberName: member.displayName,
            pointsDelta: current.bonusPoints,
            note: `Weekly consistency bonus: ${completedDays.length} chore days`,
            createdAt: serverTimestamp(),
            createdByUid: profile.uid,
            createdByName: profile.displayName,
            source: "weekly_consistency_bonus",
          });
          return current.bonusPoints;
        }
      }

      transaction.update(memberRef, { weeklyConsistency: nextConsistency });
      return 0;
    });
  };

  const handleApprove = async (chore: Chore) => {
    if (!profile) return;
    setDecidingChoreId(chore.id);
    try {
      const approval = await runTransaction(db, async (transaction) => {
        const choreRef = doc(collection(db, "chores"), chore.id);
        const logRef = doc(collection(db, "pointsLogs"), `chore_approved_${chore.id}`);
        const choreSnap = await transaction.get(choreRef);
        if (!choreSnap.exists) throw new Error("Chore does not exist.");

        const latestChore = { id: choreSnap.id, ...choreSnap.data() } as Chore;
        if (latestChore.status !== "submitted") {
          throw new Error("This chore has already been decided.");
        }
        if (latestChore.familyCode !== profile.familyCode) {
          throw new Error("Chore belongs to another family.");
        }

        const recipientUid = latestChore.completedByUid || latestChore.assignedToUid;
        let childMember = recipientUid
          ? familyMembers.find(m => m.uid === recipientUid)
          : null;
        if (!childMember) {
          const name = latestChore.completedBy || latestChore.assignedTo;
          childMember = familyMembers.find(m => namesMatch(m.displayName, name));
        }
        if (!childMember || childMember.familyCode !== profile.familyCode) {
          throw new Error("The chore recipient is not a current family member.");
        }

        const memberRef = doc(collection(db, "members"), childMember.uid);
        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists) throw new Error("Member does not exist!");

        const latestMember = { uid: memberSnap.id, ...memberSnap.data() } as Profile;
        if (latestMember.familyCode !== profile.familyCode) {
          throw new Error("The chore recipient is not in your family.");
        }

        const awardedPoints = Number(latestChore.points) || 0;
        if (awardedPoints < 0) throw new Error("Chore points cannot be negative.");
        const currentPoints = (memberSnap.data() as Profile).points || 0;
        const newPoints = currentPoints + awardedPoints;

        transaction.update(memberRef, { points: newPoints });
        transaction.update(choreRef, { status: "approved", completedAt: serverTimestamp() });
        transaction.set(logRef, {
          familyCode: childMember.familyCode,
          memberUid: childMember.uid,
          memberName: childMember.displayName,
          pointsDelta: awardedPoints,
          note: `Chore approved: ${latestChore.title}`,
          createdAt: serverTimestamp(),
          createdByUid: profile.uid,
          createdByName: profile.displayName,
          source: "chore_approved",
          choreId: latestChore.id,
        });

        return { member: childMember, points: awardedPoints, title: latestChore.title };
      });

      const consistencyBonus = chore.isBounty || chore.required === false
        ? 0
        : await recordConsistencyDay(approval.member.uid);

      if (approval.member.pushToken) {
        sendPushNotification(
          approval.member.pushToken,
          "Chore Approved! ✅",
          consistencyBonus
            ? `${approval.title} was approved. You earned ${approval.points} points plus a ${consistencyBonus}-point consistency bonus!`
            : `${approval.title} was approved. You earned ${approval.points} points!`
        );
      }

      triggerHapticSuccess();
      return true;
    } catch (error: unknown) {
      console.error("Approve Error:", error);
      Alert.alert("Error", "Approve failed: " + getErrorMessage(error, "Unknown error"));
      return false;
    } finally {
      setDecidingChoreId(null);
    }
  };

  const handleRedo = async (chore: Chore, feedback: string) => {
    if (!profile) return false;
    const normalizedFeedback = feedback.trim();
    if (!normalizedFeedback) {
      Alert.alert("Feedback Required", "Tell them exactly what needs another try.");
      return false;
    }

    setDecidingChoreId(chore.id);
    try {
      await updateDoc(doc(collection(db, "chores"), chore.id), {
        status: "redo",
        feedback: normalizedFeedback,
      });

      const recipientUid = chore.completedByUid || chore.assignedToUid;
      const member = recipientUid
        ? familyMembers.find((candidate) => candidate.uid === recipientUid)
        : familyMembers.find((candidate) => namesMatch(candidate.displayName, chore.completedBy || chore.assignedTo));
      if (member?.pushToken) {
        sendPushNotification(
          member.pushToken,
          "Chore Needs Another Try",
          `${chore.title}: ${normalizedFeedback}`
        );
      }
      return true;
    } catch (error: unknown) {
      console.error("Redo Error:", error);
      Alert.alert("Redo Failed", getErrorMessage(error, "Unable to send feedback."));
      return false;
    } finally {
      setDecidingChoreId(null);
    }
  };

  const uploadProof = async (chore: Chore) => {
    if (!profile) return;
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!res.granted) { Alert.alert("Required", "Access to photos is needed to upload proof."); return; }
    
    const picker = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsMultipleSelection: true, 
      quality: 0.7 
    });
    
    if (picker.canceled || !picker.assets?.length) return;

    setUploading(true);
    try {
      const urls = await Promise.all(picker.assets.map(async (asset, i) => {
        // 1. Optimize image
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        // 2. Prepare Storage Reference
        const fileName = `${Date.now()}-${i}.jpg`;
        const storagePath = `choreProofs/${profile.familyCode}/${chore.id}/${fileName}`;
        const reference = ref(storage, storagePath);

        // 3. Upload using putFile (Native optimized)
        await putFile(reference, manipResult.uri, {
          contentType: "image/jpeg",
          customMetadata: {
            choreId: chore.id,
            uploaderUid: profile.uid,
          },
        });
        
        // 4. Get Download URL
        return await getDownloadURL(reference);
      }));

      // 5. Update Firestore
      const updateData: Partial<Chore> = { 
        status: "submitted", 
        photoUrls: urls, 
        completedBy: profile.displayName,
        completedByUid: profile.uid,
        completedAt: serverTimestamp() 
      };
      if (chore.isBounty && !chore.assignedToUid) {
        updateData.assignedTo = profile.displayName;
        updateData.assignedToUid = profile.uid;
      }

      await updateDoc(doc(collection(db, "chores"), chore.id), updateData);

      // 6. Notify parents without exposing their device tokens to the child.
      notifyChoreSubmitted(chore.id).catch((error) => {
        console.warn("Parent notification failed:", error);
      });

      triggerHapticSuccess();
      return true;
    } catch (error: unknown) {
      console.error("Upload Error:", error);
      Alert.alert("Upload Failed", getErrorMessage(error, "An error occurred during upload."));
      return false;
    } finally {
      setUploading(false);
    }
  };

  return { handleApprove, handleRedo, uploadProof, uploading, decidingChoreId };
}
