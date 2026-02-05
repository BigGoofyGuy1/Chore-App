import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { db } from "../firebase";
import { doc, setDoc } from "@react-native-firebase/firestore";
import { Profile, Role } from "../types";
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from "react-native";

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;
  
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("No projectId found in app.json extra.eas.projectId");
    }
    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: projectId
    })).data;

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    return token;
  } catch (e) {
    console.error("Error getting push token:", e);
    return null;
  }
}

export function ProfileSetup({ user, onSave }: { user: FirebaseAuthTypes.User, onSave: (p: Profile) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("child");

  const saveProfile = async () => {
    if (!name || !code) { Alert.alert("Required", "Name and Family Code are needed."); return; }
    const token = await registerForPushNotificationsAsync();
    
    // Construct profile without undefined values
    const profile: any = {
      uid: user.uid,
      displayName: name.trim(),
      familyCode: code.trim().toLowerCase(),
      role: role,
      points: 0,
    };
    
    if (token) {
      profile.pushToken = token;
    }
    
    try {
      await setDoc(doc(db, "members", user.uid), profile);
      onSave(profile as Profile);
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Could not save profile. Please try again.");
    }
  };

  return (
    <View style={styles.center}>
      <Text style={styles.title}>Finish your profile</Text>
      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>Your Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Mom, Billy" />
        <Text style={styles.inputLabel}>Family Code</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Shared family secret" autoCapitalize="none" />
        <Text style={styles.inputLabel}>Role</Text>
        <View style={styles.chipRow}>
          {(['parent', 'child'] as const).map(r => (
            <TouchableOpacity key={r} style={[styles.chip, role === r && styles.chipActive]} onPress={() => setRole(r)}>
              <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 30 }]} onPress={saveProfile}><Text style={styles.primaryBtnText}>Start Using App</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#FFF' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
