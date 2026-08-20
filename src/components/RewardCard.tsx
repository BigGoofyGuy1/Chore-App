import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Reward, Profile } from '../types';

interface RewardCardProps {
  reward: Reward;
  profile: Profile;
  currentMember?: Profile;
  onClaim?: (reward: Reward) => void;
  onDelete?: (reward: Reward) => void;
  onPin?: (reward: Reward) => void;
  isPinned?: boolean;
}

export const RewardCard: React.FC<RewardCardProps> = ({ 
  reward, 
  profile, 
  currentMember, 
  onClaim, 
  onDelete,
  onPin,
  isPinned = false,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '700' }}>{reward.title}</Text>
        <Text style={{ color: '#F59E0B', fontWeight: '800' }}>{reward.points} Pts</Text>
      </View>
      <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
        {profile.role === 'child' ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.pinBtn, isPinned && styles.pinBtnActive]}
              onPress={() => onPin?.(reward)}
            >
              <Text style={[styles.pinBtnText, isPinned && styles.pinBtnTextActive]}>{isPinned ? 'Pinned Goal' : 'Pin Goal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.secondaryBtn, { flex: 1, opacity: (currentMember?.points || 0) >= reward.points ? 1 : 0.5 }]}
              disabled={(currentMember?.points || 0) < reward.points}
              onPress={() => onClaim?.(reward)}
            >
              <Text style={styles.secondaryBtnText}>Claim Reward</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity 
            style={[styles.secondaryBtn, { flex: 1, backgroundColor: '#FEF2F2' }]} 
            onPress={() => onDelete?.(reward)}
          >
            <Text style={[styles.secondaryBtnText, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  row: { flexDirection: 'row', alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  secondaryBtnText: { color: '#0F172A', fontWeight: '600' },
  pinBtn: { flex: 1, backgroundColor: '#FFFBEB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#FDE68A' },
  pinBtnActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  pinBtnText: { color: '#B45309', fontWeight: '700' },
  pinBtnTextActive: { color: '#FFF' },
});
