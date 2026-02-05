import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Reward, Profile } from '../types';

interface RewardCardProps {
  reward: Reward;
  profile: Profile;
  currentMember?: Profile;
  onClaim?: (reward: Reward) => void;
  onDelete?: (reward: Reward) => void;
}

export const RewardCard: React.FC<RewardCardProps> = ({ 
  reward, 
  profile, 
  currentMember, 
  onClaim, 
  onDelete 
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '700' }}>{reward.title}</Text>
        <Text style={{ color: '#F59E0B', fontWeight: '800' }}>{reward.points} Pts</Text>
      </View>
      <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
        {profile.role === 'child' ? (
          <TouchableOpacity 
            style={[styles.secondaryBtn, { flex: 1, opacity: (currentMember?.points || 0) >= reward.points ? 1 : 0.5 }]} 
            disabled={(currentMember?.points || 0) < reward.points} 
            onPress={() => onClaim?.(reward)}
          >
            <Text style={styles.secondaryBtnText}>Claim Reward</Text>
          </TouchableOpacity>
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
});
