import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../firebase';
import { collection, addDoc, doc, deleteDoc } from '@react-native-firebase/firestore';
import { Profile, Reward } from '../types';
import { RewardCard } from '../components/RewardCard';

interface StoreScreenProps {
  profile: Profile;
  rewards: Reward[];
  familyMembers: Profile[];
}

export const StoreScreen: React.FC<StoreScreenProps> = ({ profile, rewards, familyMembers }) => {
  const [rTitle, setRTitle] = useState("");
  const [rPoints, setRPoints] = useState("20");
  const currentMember = familyMembers.find(m => m.uid === profile.uid);

  const addReward = async () => { 
    if (!rTitle) return; 
    try {
      await addDoc(collection(db, "rewards"), { 
        title: rTitle.trim(), 
        points: parseInt(rPoints) || 0, 
        familyCode: profile.familyCode 
      }); 
      setRTitle(""); 
      setRPoints("20");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to add reward.");
    }
  };

  const handleClaim = (reward: Reward) => {
    Alert.alert("Claimed!", `Go show your parent that you want: ${reward.title}. They will deduct the points once you receive it.`);
  };

  const handleDelete = async (reward: Reward) => {
    Alert.alert("Delete Reward", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          await deleteDoc(doc(collection(db, "rewards"), reward.id));
        } catch (e) {
          console.error(e);
          Alert.alert("Error", "Failed to delete reward.");
        }
      }}
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Store & Points</Text>
      
      {profile.role === 'child' && (
        <View style={[styles.formCard, { backgroundColor: '#2563EB', alignItems: 'center' }]}>
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Your Wallet</Text>
          <Text style={{ color: '#FFF', fontSize: 48, fontWeight: '900' }}>{currentMember?.points || 0}</Text>
          <Text style={{ color: '#BFDBFE', fontSize: 14 }}>Total Points</Text>
        </View>
      )}

      {profile.role === 'parent' && (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Manage Rewards</Text>
          <TextInput style={styles.input} placeholder="Reward Name" value={rTitle} onChangeText={setRTitle} />
          <TextInput style={styles.input} placeholder="Points Cost" value={rPoints} onChangeText={setRPoints} keyboardType="numeric" />
          <TouchableOpacity style={styles.secondaryBtn} onPress={addReward}>
            <Text style={styles.secondaryBtnText}>Add New Reward</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Available Rewards</Text>
      <View style={{ marginTop: 10 }}>
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
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  secondaryBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  secondaryBtnText: { color: '#0F172A', fontWeight: '600' },
  emptyText: { fontStyle: 'italic', color: '#94A3B8', textAlign: 'center' },
});
