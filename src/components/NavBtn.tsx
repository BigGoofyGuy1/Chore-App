import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface NavBtnProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export const NavBtn: React.FC<NavBtnProps> = ({ label, active, onPress }) => {
  return (
    <TouchableOpacity style={styles.navBtn} onPress={onPress}>
      <View style={[styles.navIndicator, active && styles.navIndicatorActive]} />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIndicator: { height: 4, width: 24, borderRadius: 2, backgroundColor: 'transparent', marginBottom: 6 },
  navIndicatorActive: { backgroundColor: '#2563EB' },
  navLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  navLabelActive: { color: '#0F172A', fontWeight: '700' },
});
