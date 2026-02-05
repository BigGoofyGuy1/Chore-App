import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chore, Profile, RepeatInterval } from '../types';
import { ChoreCard } from '../components/ChoreCard';

interface ParentDashboardProps {
  profile: Profile;
  chores: Chore[];
  familyMembers: Profile[];
  onPressChore: (chore: Chore) => void;
}

const GET_FAMILY_STATUS_COLOR = (status: string) => {
  switch (status) {
    case 'approved': return '#10B981';
    case 'submitted':
    case 'in_progress': return '#F59E0B';
    default: return '#EF4444';
  }
};

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ 
  profile, 
  chores, 
  familyMembers, 
  onPressChore 
}) => {
  const [filter, setFilter] = useState<RepeatInterval | "all">("all");

  const filteredChores = filter === "all" ? chores : chores.filter(c => (c.repeat || 'none') === filter);
  const needsReview = filteredChores.filter(c => c.status === "submitted");
  
  const activeMembers = familyMembers.filter(member => 
    filteredChores.some(chore => chore.assignedTo === member.displayName)
  );

  return (
    <View style={[styles.container, { paddingTop: 60 }]}>
      <View style={styles.filterRow}>
        {(['all', 'daily', 'weekly', 'monthly'] as const).map(f => (
          <TouchableOpacity 
            key={f} 
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]} 
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList 
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Review Queue</Text>
            {needsReview.length === 0 && <Text style={[styles.emptyText, { marginVertical: 20 }]}>No chores pending review.</Text>}
            {needsReview.map(item => <ChoreCard key={item.id} chore={item} onPress={() => onPressChore(item)} />)}
            <View style={{ height: 30 }} />
            <Text style={styles.title}>Family Progress</Text>
          </>
        }
        data={activeMembers}
        keyExtractor={item => item.uid}
        renderItem={({ item: member }) => {
          const memberChores = filteredChores.filter(c => c.assignedTo === member.displayName);
          return (
            <View key={member.uid} style={styles.familySection}>
              <View style={styles.familySectionHeader}>
                <Text style={styles.childName}>{member.displayName} ({member.role})</Text>
                <Text style={styles.choreCount}>{memberChores.length} tasks</Text>
              </View>
              {memberChores.map(chore => (
                <TouchableOpacity key={chore.id} style={styles.miniChoreRow} onPress={() => onPressChore(chore)}>
                  <View style={[styles.statusIndicator, { backgroundColor: GET_FAMILY_STATUS_COLOR(chore.status) }]} />
                  <View style={{ flex: 1 }}><Text style={styles.miniChoreTitle}>{chore.title}</Text></View>
                  <Text style={styles.miniChoreStatus}>{chore.status.replace('_', ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  filterRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 16 },
  filterBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  filterBtnActive: { backgroundColor: '#FFF' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterTextActive: { color: '#0F172A' },
  emptyText: { fontStyle: 'italic', color: '#94A3B8', textAlign: 'center' },
  familySection: { marginBottom: 20 },
  familySectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  childName: { fontSize: 16, fontWeight: '600' },
  choreCount: { fontSize: 12, color: '#64748B' },
  miniChoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  statusIndicator: { width: 10, height: 10, borderRadius: 5, marginRight: 12, marginTop: 5 },
  miniChoreTitle: { fontSize: 15, color: '#334155' },
  miniChoreStatus: { fontSize: 12, color: '#94A3B8', textTransform: 'capitalize' },
});
