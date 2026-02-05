import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, collection, updateDoc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import { ref, uploadFile, getDownloadURL } from '@react-native-firebase/storage';
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { db, storage } from '../firebase';
import { Chore, Profile } from '../types';
import { sendPushNotification, triggerHapticSuccess } from '../utils/sendPushNotification';

export function useChoreActions(profile: Profile | null, familyMembers: Profile[]) {
  const [uploading, setUploading] = useState(false);

  const handleApprove = async (chore: Chore) => {
    if (!profile) return;
    try {
      const childMember = familyMembers.find(m => m.displayName === chore.assignedTo);
      if (!childMember) return;

      await runTransaction(db, async (transaction) => {
        const memberRef = doc(collection(db, "members"), childMember.uid);
        const choreRef = doc(collection(db, "chores"), chore.id);
        
        const memberSnap = await transaction.get(memberRef);
        if (!memberSnap.exists) throw "Member does not exist!";
        
        const newPoints = ((memberSnap.data() as Profile).points || 0) + (chore.points || 0);
        transaction.update(memberRef, { points: newPoints });
        transaction.update(choreRef, { status: "approved", completedAt: serverTimestamp() });
      });

      if (childMember.pushToken) {
        sendPushNotification(childMember.pushToken, "Chore Approved! ✅", `${chore.title} was approved. You earned ${chore.points} points!`);
      }

      triggerHapticSuccess();
      return true;
    } catch (e) { 
      Alert.alert("Error", "Approve failed."); 
      return false;
    }
  };

  const uploadProof = async (chore: Chore) => {
    if (!profile) return;
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!res.granted) { Alert.alert("Required", "Access needed."); return; }
    
    const picker = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsMultipleSelection: true, 
      quality: 0.7 
    });
    
    if (picker.canceled || !picker.assets?.length) return;

    setUploading(true);
    try {
      const urls = await Promise.all(picker.assets.map(async (asset, i) => {
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );

        const storagePath = `choreProofs/${profile.familyCode}/${chore.id}-${Date.now()}-${i}.jpg`;
        const storageRef = ref(storage, storagePath);
        await uploadFile(storageRef, manipResult.uri);
        return getDownloadURL(storageRef);
      }));

      await updateDoc(doc(collection(db, "chores"), chore.id), { 
        status: "submitted", 
        photoUrls: urls, 
        completedBy: profile.displayName, 
        completedAt: serverTimestamp() 
      });

      familyMembers.filter(m => m.role === 'parent' && m.pushToken).forEach(p => {
        if (p.pushToken) sendPushNotification(p.pushToken!, "Chore Submitted! 📸", `${profile.displayName} finished ${chore.title}. Review it now!`);
      });

      triggerHapticSuccess();
      return true;
    } catch (error) { 
      console.error(error);
      Alert.alert("Error", "Upload failed."); 
      return false;
    } finally {
      setUploading(false);
    }
  };

  return { handleApprove, uploadProof, uploading };
}
