import React, { useMemo } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../firebase';
import { Profile } from '../types';

interface FamilyScreenProps {
  familyMembers: Profile[];
  profile: Profile;
}

export const FamilyScreen: React.FC<FamilyScreenProps> = ({ familyMembers, profile }) => {
  const validMembers = useMemo(() => familyMembers.filter(m => m.displayName?.trim()), [familyMembers]);

  const handleInvite = async () => {
    try {
      await Share.share({
        message: `Join our family on Chore App!\n\nFamily Code: ${profile.familyCode}\n\nDownload the app and enter this code during setup.`,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const handleSignOut = () => {
    signOut(auth).then(() => Alert.alert("Signed Out")).catch(e => Alert.alert("Error Signing Out", e.message));
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Family Hub</Text>
      
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Invite Family</Text>
        <Text style={styles.detailLabel}>Family Code: <Text style={{ color: '#0F172A', fontWeight: '700' }}>{profile.familyCode}</Text></Text>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 15 }]} onPress={handleInvite}>
          <Text style={styles.primaryBtnText}>Share Invite Link</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Balances</Text>
        {validMembers.map((c) => (
          <View key={c.uid} style={styles.miniChoreRow}>
            <Text style={styles.childName}>{c.displayName} ({c.role})</Text>
            <Text style={{ fontWeight: '800', color: '#10B981' }}>{c.points || 0} Pts</Text>
          </View>
        ))}
      </View>
      
      <TouchableOpacity style={{ marginTop: 40, alignItems: 'center' }} onPress={handleSignOut}>
        <Text style={styles.linkText}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  detailLabel: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  miniChoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  childName: { fontSize: 16, fontWeight: '600' },
  linkText: { color: '#2563EB', fontWeight: '600' },
});
