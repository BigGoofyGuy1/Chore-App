import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Chore, ChoreStatus } from '../types';

const STATUS_CONFIG: Record<ChoreStatus, { color: string, label: string }> = {
  pending: { color: '#64748B', label: 'Not Started' },
  in_progress: { color: '#F59E0B', label: 'In Progress' },
  submitted: { color: '#3B82F6', label: 'Submitted' },
  redo: { color: '#EF4444', label: 'Needs Redo' },
  approved: { color: '#10B981', label: 'Approved' },
};

const formatDate = (date: Date) => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${m}-${d}-${y}`;
};

interface ChoreCardProps {
  chore: Chore;
  onPress: () => void;
}

export const ChoreCard: React.FC<ChoreCardProps> = ({ chore, onPress }) => {
  const config = STATUS_CONFIG[chore.status];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{chore.title}</Text>
          <Text style={styles.cardDue}>
            {chore.points} Pts • {chore.dueAt ? formatDate(chore.dueAt.toDate()) : 'No date'}
          </Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: config.color }]}>
          <Text style={styles.statusLabel}>{config.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#0F172A' },
  cardDue: { fontSize: 14, color: '#64748B', marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusLabel: { fontSize: 12, color: '#FFF', fontWeight: '700' },
});
