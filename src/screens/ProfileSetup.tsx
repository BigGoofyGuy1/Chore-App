import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { User } from "@react-native-firebase/auth";
import { Profile, Role } from "../types";
import { createFamily, joinWithInvite } from "../utils/callableFunctions";
import { registerForPushNotificationsAsync } from "../utils/notifications";

type SignupMode = "create" | "join";

export function ProfileSetup({
  user,
  onSave,
  initialInviteCode,
}: {
  user: User;
  onSave: (p: Profile) => void;
  initialInviteCode?: string | null;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<SignupMode>(user.isAnonymous ? "join" : "create");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const normalizedInviteCode = initialInviteCode?.trim().toUpperCase();
    if (!normalizedInviteCode) return;
    setMode("join");
    setCode(normalizedInviteCode);
  }, [initialInviteCode]);

  const saveProfile = async () => {
    const displayName = name.trim();
    const inviteCode = code.trim().toUpperCase();
    if (!displayName) {
      Alert.alert("Required", "Your name is needed.");
      return;
    }
    if (mode === "join" && !inviteCode) {
      Alert.alert("Required", "An invite code is needed to join a family.");
      return;
    }

    setSaving(true);
    try {
      const token = await registerForPushNotificationsAsync();
      let familyCode = "";
      let role: Role = "parent";

      if (mode === "create") {
        const result = await createFamily({
          displayName,
          pushToken: token || null,
        });
        familyCode = result.familyCode;
      } else {
        const result = await joinWithInvite({
          displayName,
          code: inviteCode,
          pushToken: token || null,
        });
        familyCode = result.familyCode;
        role = result.role;
      }

      const profile: Profile = {
        uid: user.uid,
        displayName,
        familyCode,
        role,
        points: 0,
        pushToken: token || null,
      };

      onSave(profile);
    } catch (error) {
      console.error("Error saving profile:", error);
      const err = error as { code?: string; message?: string; details?: unknown } | null;
      const detailsText = err?.details
        ? (typeof err.details === "string" ? err.details : JSON.stringify(err.details))
        : null;
      const parts = [
        err?.message || "Could not save profile. Please try again.",
        err?.code ? `Code: ${err.code}` : null,
        detailsText ? `Details: ${detailsText}` : null,
      ].filter(Boolean);
      Alert.alert("Error", parts.join("\n"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Set up your family</Text>
      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>What are you doing?</Text>
        <View style={styles.chipRow}>
          {([
            ...(!user.isAnonymous ? [{ key: "create", label: "Create Family" } as const] : []),
            { key: "join", label: "Join With Invite" } as const,
          ]).map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.chip, mode === option.key && styles.chipActive]}
              onPress={() => setMode(option.key)}
            >
              <Text style={[styles.chipText, mode === option.key && styles.chipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.inputLabel}>Your Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Mom, Billy" />
        {mode === "join" ? (
          <>
            <Text style={styles.inputLabel}>Invite Code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="One-time invite code"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={styles.helperText}>
              Invite links open this screen automatically. You can still paste or type the code manually.
            </Text>
          </>
        ) : (
          <Text style={styles.helperText}>
            Creating a family makes you the first parent. You can invite everyone else after setup.
          </Text>
        )}
        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 30 }, saving && styles.primaryBtnDisabled]}
          onPress={saveProfile}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>
            {saving ? "Working..." : mode === "create" ? "Create Family" : "Join Family"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  helperText: { fontSize: 14, lineHeight: 20, color: '#64748B', marginTop: 16 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#FFF' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
