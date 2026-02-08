import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chore, Profile } from '../types';
import { ChoreCard } from '../components/ChoreCard';
import { namesMatch } from '../utils/nameMatch';

interface ChildDashboardProps {
  profile: Profile;
  chores: Chore[];
  onPressChore: (chore: Chore) => void;
}

export const ChildDashboard: React.FC<ChildDashboardProps> = ({ 
  profile, 
  chores, 
  onPressChore 
}) => {
  const [bountiesOpen, setBountiesOpen] = useState(true);

  const assigned = useMemo(() => (
    chores.filter(c =>
      c.assignedToUid ? c.assignedToUid === profile.uid : namesMatch(c.assignedTo, profile.displayName)
    )
  ), [chores, profile.uid, profile.displayName]);

  const bounties = useMemo(() => (
    chores
      .filter(c => c.isBounty)
      .filter(c => !c.assignedToUid)
      .filter(c => c.status !== 'approved' && c.status !== 'submitted')
      .sort((a, b) => (a.title || "").toLowerCase().localeCompare((b.title || "").toLowerCase(), "en"))
  ), [chores]);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hi, {profile.displayName} 👋</Text>
      <FlatList 
        ListHeaderComponent={
          <View style={styles.bountySection}>
            <TouchableOpacity style={styles.bountyHeader} onPress={() => setBountiesOpen(v => !v)}>
              <Text style={styles.bountyTitle}>Bounties</Text>
              <Text style={styles.bountyToggle}>{bountiesOpen ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
            {bountiesOpen ? (
              bounties.length ? (
                bounties.map((item) => (
                  <ChoreCard key={item.id} chore={item} onPress={() => onPressChore(item)} />
                ))
              ) : (
                <Text style={styles.emptyText}>No bounties right now.</Text>
              )
            ) : null}
          </View>
        }
        data={assigned} 
        keyExtractor={item => item.id} 
        renderItem={({ item }) => (
          <ChoreCard chore={item} onPress={() => onPressChore(item)} />
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 20 },
  bountySection: { marginBottom: 10 },
  bountyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bountyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  bountyToggle: { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  emptyText: { fontStyle: 'italic', color: '#94A3B8', marginBottom: 12 },
});
