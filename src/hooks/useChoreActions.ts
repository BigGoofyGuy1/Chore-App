import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, collection, updateDoc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { db } from '../firebase';
import { Chore, Profile } from '../types';
import { sendPushNotification, triggerHapticSuccess } from '../utils/sendPushNotification';
import { namesMatch } from '../utils/nameMatch';

export function useChoreActions(profile: Profile | null, familyMembers: Profile[]) {
  const [uploading, setUploading] = useState(false);

  const handleApprove = async (chore: Chore) => {
    if (!profile) return;
    try {
      const recipientUid = chore.completedByUid || chore.assignedToUid;
      let childMember = recipientUid
        ? familyMembers.find(m => m.uid === recipientUid)
        : null;
      if (!childMember) {
        const name = chore.completedBy || chore.assignedTo;
        childMember = familyMembers.find(m => namesMatch(m.displayName, name));
      }
      if (!childMember) return;

      await runTransaction(db, async (transaction) => {
        const memberRef = doc(collection(db, "members"), childMember.uid);
        const choreRef = doc(collection(db, "chores"), chore.id);
        const logRef = doc(collection(db, "pointsLogs"));
        
        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists) throw new Error("Member does not exist!");
        
        const currentPoints = (memberSnap.data() as Profile).points || 0;
        const newPoints = currentPoints + (chore.points || 0);
        
        transaction.update(memberRef, { points: newPoints });
        transaction.update(choreRef, { status: "approved", completedAt: serverTimestamp() });
        transaction.set(logRef, {
          familyCode: childMember.familyCode,
          memberUid: childMember.uid,
          memberName: childMember.displayName,
          pointsDelta: chore.points || 0,
          note: `Chore approved: ${chore.title}`,
          createdAt: serverTimestamp(),
          createdByUid: profile.uid,
          createdByName: profile.displayName,
          source: "chore_approved",
          choreId: chore.id,
        });
      });

      if (childMember.pushToken) {
        sendPushNotification(childMember.pushToken, "Chore Approved! ✅", `${chore.title} was approved. You earned ${chore.points} points!`);
      }

      triggerHapticSuccess();
      return true;
    } catch (e: any) { 
      console.error("Approve Error:", e);
      Alert.alert("Error", "Approve failed: " + (e.message || "Unknown error")); 
      return false;
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
        const fileName = `${chore.id}-${Date.now()}-${i}.jpg`;
        const storagePath = `choreProofs/${profile.familyCode}/${fileName}`;
        const reference = storage().ref(storagePath);

        // 3. Upload using putFile (Native optimized)
        await reference.putFile(manipResult.uri);
        
        // 4. Get Download URL
        return await reference.getDownloadURL();
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

      // 6. Notify parents
      familyMembers.filter(m => m.role === 'parent' && m.pushToken).forEach(p => {
        sendPushNotification(p.pushToken!, "Chore Submitted! 📸", `${profile.displayName} finished ${chore.title}. Review it now!`);
      });

      triggerHapticSuccess();
      return true;
    } catch (error: any) { 
      console.error("Upload Error:", error);
      Alert.alert("Upload Failed", error.message || "An error occurred during upload."); 
      return false;
    } finally {
      setUploading(false);
    }
  };

  return { handleApprove, uploadProof, uploading };
}
