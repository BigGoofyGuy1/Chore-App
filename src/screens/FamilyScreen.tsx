import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Profile } from '../types';

interface FamilyScreenProps {
  profile: Profile;
  familyMembers: Profile[];
  onSignOut: () => void;
  onOpenSettings?: () => void;
}

export const FamilyScreen: React.FC<FamilyScreenProps> = ({
  profile,
  familyMembers,
  onSignOut,
  onOpenSettings,
}) => {
  const normalizedRole = typeof profile.role === 'string' ? profile.role.trim().toLowerCase() : '';
  const isParent = normalizedRole === 'parent';
  const listedMembers = familyMembers.filter((member) => member.displayName?.trim());
  const validMembers = listedMembers.some((member) => member.uid === profile.uid) || !profile.displayName?.trim()
    ? listedMembers
    : [profile, ...listedMembers];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Family Hub</Text>
        {isParent && onOpenSettings ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open parent settings"
            style={styles.settingsButton}
            onPress={onOpenSettings}
          >
            <Ionicons name="settings-sharp" size={21} color="#475569" />
          </TouchableOpacity>
        ) : null}
      </View>
      
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Balances</Text>
        {validMembers.length ? (
          validMembers.map((c) => (
            <View key={c.uid} style={styles.miniChoreRow}>
              <Text style={styles.childName}>{c.displayName} ({c.role})</Text>
              <Text style={styles.points}>{c.points || 0} Pts</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No family members are available yet.</Text>
        )}
      </View>
      
      <TouchableOpacity style={{ marginTop: 40, alignItems: 'center' }} onPress={onSignOut}>
        <Text style={styles.linkText}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  miniChoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  childName: { fontSize: 16, fontWeight: '600' },
  points: { fontWeight: '800', color: '#10B981' },
  emptyText: { color: '#64748B', fontStyle: 'italic' },
  linkText: { color: '#2563EB', fontWeight: '600' },
});
