import React, { useState } from "react";
import { 
  Alert, 
  ActivityIndicator,
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View 
} from "react-native";
import { auth } from "../firebase";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
} from "@react-native-firebase/auth";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [joiningAsChild, setJoiningAsChild] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const handleAuth = async () => {
    if (!normalizedEmail || !password) {
      Alert.alert("Required", "Enter both your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      } else {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await sendEmailVerification(credential.user);
        Alert.alert(
          "Verify Your Email",
          "We sent a verification link. Open it before finishing setup."
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Authentication failed.";
      Alert.alert("Auth Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinAsChild = async () => {
    setJoiningAsChild(true);
    try {
      await signInAnonymously(auth);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unable to start child setup.";
      Alert.alert("Child Setup Failed", message);
    } finally {
      setJoiningAsChild(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!normalizedEmail) {
      Alert.alert("Email Required", "Enter your email first so we know where to send the reset link.");
      return;
    }

    setResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      Alert.alert("Reset Email Sent", "Check your inbox for the password reset link.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unable to send a reset email right now.";
      Alert.alert("Reset Failed", message);
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <View style={styles.center}>
      <Text style={[styles.title, { marginBottom: 20 }]}>
        {isLogin ? "Welcome Back" : "Create Account"}
      </Text>
      <TextInput 
        style={[styles.input, { width: '100%' }]} 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        autoCapitalize="none" 
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput 
        style={[styles.input, { width: '100%' }]} 
        placeholder="Password" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry 
        autoComplete={isLogin ? "password" : "new-password"}
      />
      <TouchableOpacity style={[styles.primaryBtn, submitting && styles.disabledBtn]} onPress={handleAuth} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.primaryBtnText}>{isLogin ? "Sign In" : "Sign Up"}</Text>
        )}
      </TouchableOpacity>
      {isLogin ? (
        <TouchableOpacity onPress={handlePasswordReset} style={styles.secondaryAction} disabled={resettingPassword}>
          <Text style={styles.linkText}>
            {resettingPassword ? "Sending reset link..." : "Forgot password?"}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.helperText}>
          New accounts need email verification before they can join or create a family.
        </Text>
      )}
      <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ marginTop: 20 }}>
        <Text style={styles.linkText}>
          {isLogin ? "Need an account? Sign Up" : "Have an account? Sign In"}
        </Text>
      </TouchableOpacity>
      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.divider} />
      </View>
      <TouchableOpacity
        style={[styles.childBtn, joiningAsChild && styles.disabledBtn]}
        onPress={handleJoinAsChild}
        disabled={joiningAsChild || submitting}
      >
        {joiningAsChild ? (
          <ActivityIndicator color="#1D4ED8" />
        ) : (
          <Text style={styles.childBtnText}>Join as a Child</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.childHelperText}>
        Children only need a one-time invite code from a parent—no email account required.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  disabledBtn: { opacity: 0.7 },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  helperText: { marginTop: 16, fontSize: 14, lineHeight: 20, color: '#64748B', textAlign: 'center' },
  secondaryAction: { marginTop: 16 },
  linkText: { color: '#2563EB', fontWeight: '600' },
  dividerRow: { width: '100%', flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  divider: { flex: 1, height: 1, backgroundColor: '#CBD5E1' },
  dividerText: { marginHorizontal: 12, color: '#94A3B8', fontWeight: '600' },
  childBtn: { backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', paddingVertical: 14, alignItems: 'center', width: '100%' },
  childBtnText: { color: '#1D4ED8', fontWeight: '700', fontSize: 16 },
  childHelperText: { marginTop: 10, color: '#64748B', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
