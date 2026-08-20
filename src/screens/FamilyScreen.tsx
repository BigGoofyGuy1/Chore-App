import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const validMembers = useMemo(() => familyMembers.filter(m => m.displayName?.trim()), [familyMembers]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Family Hub</Text>
        {profile.role === 'parent' && onOpenSettings ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open parent settings"
            style={styles.settingsButton}
            onPress={onOpenSettings}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        ) : null}
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
  settingsIcon: { fontSize: 20, lineHeight: 22, color: '#475569' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  miniChoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  childName: { fontSize: 16, fontWeight: '600' },
  linkText: { color: '#2563EB', fontWeight: '600' },
});
