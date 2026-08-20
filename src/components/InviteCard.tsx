import React, { useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createInvite } from '../utils/callableFunctions';

type InviteRole = 'parent' | 'child';

type Invite = {
  code: string;
  role: InviteRole;
  url: string;
};

const buildInviteUrl = (code: string) => `choreapp://join?code=${encodeURIComponent(code)}`;

export const InviteCard: React.FC = () => {
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null);
  const [creatingRole, setCreatingRole] = useState<InviteRole | null>(null);
  const [sharingInvite, setSharingInvite] = useState(false);

  const handleCreateInvite = async (role: InviteRole) => {
    setCreatingRole(role);
    try {
      const result = await createInvite({ role });
      const invite = { code: result.code, role, url: buildInviteUrl(result.code) };
      setLatestInvite(invite);
      Alert.alert(
        `${role === 'parent' ? 'Parent' : 'Child'} Invite Ready`,
        `Share ${invite.url} or the fallback code ${invite.code}. It works once and then expires automatically.`
      );
    } catch (error: unknown) {
      console.error('Create invite error:', error);
      const message = error instanceof Error ? error.message : 'Unable to create an invite right now.';
      Alert.alert('Invite Failed', message);
    } finally {
      setCreatingRole(null);
    }
  };

  const handleShareInvite = async () => {
    if (!latestInvite) return;

    setSharingInvite(true);
    try {
      await Share.share({
        message: `Join my family on Chore App as a ${latestInvite.role}. Open ${latestInvite.url} or enter invite code ${latestInvite.code}.`,
        url: latestInvite.url,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to open the share sheet right now.';
      Alert.alert('Share Failed', message);
    } finally {
      setSharingInvite(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Invite Someone</Text>
      <Text style={styles.helper}>Create a one-time code for the next person joining your family.</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Create child invite"
          accessibilityState={{ disabled: creatingRole !== null, busy: creatingRole === 'child' }}
          style={[styles.primaryButton, creatingRole !== null && styles.disabledButton]}
          onPress={() => handleCreateInvite('child')}
          disabled={creatingRole !== null}
        >
          {creatingRole === 'child' ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Create Child Invite</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Create parent invite"
          accessibilityState={{ disabled: creatingRole !== null, busy: creatingRole === 'parent' }}
          style={[styles.secondaryButton, creatingRole !== null && styles.disabledButton]}
          onPress={() => handleCreateInvite('parent')}
          disabled={creatingRole !== null}
        >
          {creatingRole === 'parent' ? (
            <ActivityIndicator color="#1D4ED8" />
          ) : (
            <Text style={styles.secondaryButtonText}>Create Parent Invite</Text>
          )}
        </TouchableOpacity>
      </View>

      {latestInvite ? (
        <View style={styles.inviteBox}>
          <Text style={styles.inviteLabel}>Latest {latestInvite.role} invite</Text>
          <Text selectable style={styles.inviteCode}>{latestInvite.code}</Text>
          <Text selectable style={styles.inviteLink}>{latestInvite.url}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Share ${latestInvite.role} invite`}
            accessibilityState={{ disabled: sharingInvite, busy: sharingInvite }}
            style={[styles.secondaryButton, styles.shareButton, sharingInvite && styles.disabledButton]}
            onPress={handleShareInvite}
            disabled={sharingInvite}
          >
            {sharingInvite ? (
              <ActivityIndicator color="#1D4ED8" />
            ) : (
              <Text style={styles.secondaryButtonText}>Share Invite Link</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  helper: { color: '#64748B', fontSize: 13, lineHeight: 18, marginTop: 5 },
  actions: { gap: 12, marginTop: 16 },
  primaryButton: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700', fontSize: 16 },
  disabledButton: { opacity: 0.6 },
  inviteBox: { marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  inviteLabel: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  inviteCode: { marginTop: 8, fontSize: 24, fontWeight: '800', letterSpacing: 2, color: '#0F172A' },
  inviteLink: { marginTop: 8, color: '#2563EB', fontWeight: '600' },
  shareButton: { marginTop: 16 },
});
