import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { User } from "@react-native-firebase/auth";
import { sendEmailVerification } from "@react-native-firebase/auth";

type EmailVerificationScreenProps = {
  user: User;
  onRefresh: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function EmailVerificationScreen({
  user,
  onRefresh,
  onSignOut,
}: EmailVerificationScreenProps) {
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      await sendEmailVerification(user);
      Alert.alert("Verification Sent", "We sent a fresh verification link to your inbox.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to resend verification right now.";
      Alert.alert("Resend Failed", message);
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.center}>
      <View style={styles.card}>
        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.body}>
          Finish verifying <Text style={styles.email}>{user.email || "your account"}</Text> before creating or joining a family.
        </Text>

        <TouchableOpacity style={[styles.primaryBtn, refreshing && styles.disabledBtn]} onPress={handleRefresh} disabled={refreshing}>
          {refreshing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>I Verified My Email</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.secondaryBtn, sending && styles.disabledBtn]} onPress={handleResend} disabled={sending}>
          {sending ? <ActivityIndicator color="#2563EB" /> : <Text style={styles.secondaryBtnText}>Resend Verification Email</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut} disabled={signingOut}>
          <Text style={styles.linkText}>{signingOut ? "Signing out..." : "Use a Different Account"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#F8FAFC" },
  card: { width: "100%", backgroundColor: "#FFF", borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "#E2E8F0" },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  body: { marginTop: 12, fontSize: 15, lineHeight: 22, color: "#475569" },
  email: { fontWeight: "700", color: "#0F172A" },
  primaryBtn: { marginTop: 24, backgroundColor: "#2563EB", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  secondaryBtn: { marginTop: 12, backgroundColor: "#EFF6FF", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#BFDBFE" },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  secondaryBtnText: { color: "#2563EB", fontWeight: "700", fontSize: 16 },
  linkBtn: { marginTop: 20, alignItems: "center" },
  linkText: { color: "#2563EB", fontWeight: "600" },
});
