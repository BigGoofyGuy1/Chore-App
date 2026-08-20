import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
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
  onCelebrationComplete?: () => void;
}

const PARTICLES = [
  { angle: -90, distance: 26, size: 6, color: '#22C55E' },
  { angle: -40, distance: 22, size: 5, color: '#34D399' },
  { angle: -10, distance: 24, size: 4, color: '#A7F3D0' },
  { angle: 20, distance: 22, size: 5, color: '#22C55E' },
  { angle: 60, distance: 26, size: 6, color: '#10B981' },
  { angle: 110, distance: 22, size: 4, color: '#34D399' },
  { angle: 150, distance: 24, size: 5, color: '#6EE7B7' },
  { angle: 190, distance: 22, size: 4, color: '#22C55E' },
];

type Particle = typeof PARTICLES[number];

type ConfettiParticleProps = {
  particle: Particle;
  progress: SharedValue<number>;
  index: number;
};

const ConfettiParticle: React.FC<ConfettiParticleProps> = ({ particle, progress, index }) => {
  const angle = (particle.angle * Math.PI) / 180;

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = Math.cos(angle) * particle.distance * progress.value;
    const translateY = Math.sin(angle) * particle.distance * progress.value;
    const opacity = interpolate(progress.value, [0, 0.05, 0.7, 1], [0, 1, 0.6, 0]);
    const scale = interpolate(progress.value, [0, 1], [1, 0.7]);
    return {
      opacity,
      transform: [
        { translateX },
        { translateY },
        { rotate: `${particle.angle}deg` },
        { scale },
      ] as const,
    };
  });

  return (
    <Animated.View
      key={`${particle.angle}-${index}`}
      style={[
        styles.particle,
        { width: particle.size, height: particle.size, backgroundColor: particle.color },
        animatedStyle,
      ]}
    />
  );
};

const GreenBurst: React.FC<{ trigger: number }> = ({ trigger }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
  }, [trigger, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.2, 1.6]);
    const opacity = interpolate(progress.value, [0, 0.05, 0.6, 1], [0, 0.6, 0.5, 0]);
    return {
      transform: [{ scale }] as const,
      opacity,
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.burst, animatedStyle]} />;
};

const ConfettiBurst: React.FC<{ trigger: number }> = ({ trigger }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) });
  }, [trigger, progress]);

  return (
    <View pointerEvents="none" style={styles.confettiContainer}>
      {PARTICLES.map((particle, index) => (
        <ConfettiParticle
          key={`${particle.angle}-${index}`}
          particle={particle}
          progress={progress}
          index={index}
        />
      ))}
    </View>
  );
};

export const ChoreCard: React.FC<ChoreCardProps> = ({ chore, onPress, onCelebrationComplete }) => {
  const config = STATUS_CONFIG[chore.status];
  const prevStatus = useRef<ChoreStatus | null>(null);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const shrinkProgress = useSharedValue(0);

  useEffect(() => {
    if (prevStatus.current && prevStatus.current !== 'approved' && chore.status === 'approved') {
      setCelebrateKey((k) => k + 1);
    }
    prevStatus.current = chore.status;
  }, [chore.status]);

  useEffect(() => {
    if (!celebrateKey) return;
    shrinkProgress.value = 0;
    shrinkProgress.value = withTiming(
      1,
      { duration: 520, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished && onCelebrationComplete) {
          runOnJS(onCelebrationComplete)();
        }
      }
    );
  }, [celebrateKey, onCelebrationComplete, shrinkProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(shrinkProgress.value, [0, 0.6, 1], [1, 0.94, 0.75]);
    const opacity = interpolate(shrinkProgress.value, [0, 0.7, 1], [1, 0.75, 0]);
    const translateY = interpolate(shrinkProgress.value, [0, 1], [0, -6]);
    return {
      transform: [{ scale }, { translateY }] as const,
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      <TouchableOpacity style={styles.cardPress} onPress={onPress} activeOpacity={0.85}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{chore.title}</Text>
            <Text style={styles.cardDue}>
              {chore.points} Pts - {chore.dueAt ? formatDate(chore.dueAt.toDate()) : 'No date'}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: config.color }]}>
            <Text style={styles.statusLabel}>{config.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
      {celebrateKey > 0 && <GreenBurst trigger={celebrateKey} />}
      {celebrateKey > 0 && <ConfettiBurst trigger={celebrateKey} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    overflow: 'hidden'
  },
  cardPress: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#0F172A' },
  cardDue: { fontSize: 14, color: '#64748B', marginTop: 2 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusLabel: { fontSize: 12, color: '#FFF', fontWeight: '700' },
  burst: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -60,
  },
  confettiContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
  },
});
