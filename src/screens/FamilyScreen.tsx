import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Profile } from '../types';
import { createInvite } from '../utils/callableFunctions';

interface FamilyScreenProps {
  profile: Profile;
  familyMembers: Profile[];
  onSignOut: () => void;
}

export const FamilyScreen: React.FC<FamilyScreenProps> = ({ profile, familyMembers, onSignOut }) => {
  const validMembers = useMemo(() => familyMembers.filter(m => m.displayName?.trim()), [familyMembers]);
  const [latestInvite, setLatestInvite] = useState<{ code: string; role: "parent" | "child"; url: string } | null>(null);
  const [creatingRole, setCreatingRole] = useState<"parent" | "child" | null>(null);
  const [sharingInvite, setSharingInvite] = useState(false);

  const buildInviteUrl = (code: string) => `choreapp://join?code=${encodeURIComponent(code)}`;

  const shareInvite = async (invite: { code: string; role: "parent" | "child"; url: string }) => {
    setSharingInvite(true);
    try {
      await Share.share({
        message: `Join my family on Chore App as a ${invite.role}. Open ${invite.url} or enter invite code ${invite.code}.`,
        url: invite.url,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to open the share sheet right now.";
      Alert.alert("Share Failed", message);
    } finally {
      setSharingInvite(false);
    }
  };

  const handleCreateInvite = async (role: "parent" | "child") => {
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
      console.error("Create invite error:", error);
      const message = error instanceof Error ? error.message : "Unable to create an invite right now.";
      Alert.alert("Invite Failed", message);
    } finally {
      setCreatingRole(null);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Family Hub</Text>

      {profile.role === 'parent' ? (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Invite Someone</Text>
          <Text style={styles.detailLabel}>
            Create a one-time code for the next person joining your family.
          </Text>
          <View style={styles.inviteActions}>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.inviteButton]}
              onPress={() => handleCreateInvite('child')}
              disabled={creatingRole !== null}
            >
              <Text style={styles.primaryBtnText}>
                {creatingRole === 'child' ? 'Creating...' : 'Create Child Invite'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.inviteButton]}
              onPress={() => handleCreateInvite('parent')}
              disabled={creatingRole !== null}
            >
              <Text style={styles.secondaryBtnText}>
                {creatingRole === 'parent' ? 'Creating...' : 'Create Parent Invite'}
              </Text>
            </TouchableOpacity>
          </View>
          {latestInvite ? (
            <View style={styles.inviteCodeBox}>
              <Text style={styles.detailLabel}>Latest {latestInvite.role} invite</Text>
              <Text style={styles.inviteCode}>{latestInvite.code}</Text>
              <Text style={styles.inviteLink}>{latestInvite.url}</Text>
              <TouchableOpacity
                style={[styles.secondaryBtn, styles.shareBtn]}
                onPress={() => shareInvite(latestInvite)}
                disabled={sharingInvite}
              >
                <Text style={styles.secondaryBtnText}>
                  {sharingInvite ? 'Opening Share Sheet...' : 'Share Invite Link'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
      
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
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  detailLabel: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#BFDBFE' },
  secondaryBtnText: { color: '#1D4ED8', fontWeight: '700', fontSize: 16 },
  inviteActions: { gap: 12, marginTop: 16 },
  inviteButton: { marginTop: 0 },
  inviteCodeBox: { marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  inviteCode: { marginTop: 8, fontSize: 24, fontWeight: '800', letterSpacing: 2, color: '#0F172A' },
  inviteLink: { marginTop: 8, color: '#2563EB', fontWeight: '600' },
  shareBtn: { marginTop: 16 },
  miniChoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  childName: { fontSize: 16, fontWeight: '600' },
  linkText: { color: '#2563EB', fontWeight: '600' },
});
