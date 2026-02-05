import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Chore, Profile } from '../types';
import { ChoreCard } from '../components/ChoreCard';

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
  const filtered = chores.filter(c => c.assignedTo === profile.displayName);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hi, {profile.displayName} 👋</Text>
      <FlatList 
        data={filtered} 
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
});
