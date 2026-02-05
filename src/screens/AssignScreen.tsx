import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db, timestampFromDate } from '../firebase';
import { collection, addDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { Profile, RepeatInterval } from '../types';
import { sendPushNotification, triggerHapticSuccess } from '../utils/sendPushNotification';

interface AssignScreenProps {
  profile: Profile;
  familyMembers: Profile[];
}

const formatDate = (date: Date) => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${m}-${d}-${y}`;
};

export const AssignScreen: React.FC<AssignScreenProps> = ({ profile, familyMembers }) => {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pts, setPts] = useState("5");
  const [selectedUid, setSelectedUid] = useState("");
  const [repeat, setRepeat] = useState<RepeatInterval>("none");
  const [date, setEditDueDate] = useState(new Date());
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !selectedUid) {
      Alert.alert("Missing Information", "Please provide a title and select a person.");
      return;
    }

    const target = familyMembers.find(m => m.uid === selectedUid);
    if (!target) {
      Alert.alert("Error", "Selected person not found in your family.");
      return;
    }

    if (!profile.familyCode) {
      Alert.alert("Error", "Family code missing from your profile.");
      return;
    }

    setSaving(true);
    try {
      const choreData = { 
        title: title.trim(), 
        description: desc.trim(), 
        points: Number(pts) || 0, 
        assignedTo: target.displayName,
        assignedToUid: target.uid, 
        familyCode: profile.familyCode, 
        status: "pending", 
        createdAt: serverTimestamp(), 
        repeat, 
        dueAt: timestampFromDate(date), 
        steps: [] 
      };

      await addDoc(collection(db, "chores"), choreData);

      if (target.pushToken) {
        sendPushNotification(
          target.pushToken, 
          "New Chore Assigned! 📋", 
          `You have a new chore: ${title} (${pts} pts)`
        );
      }

      triggerHapticSuccess();
      setTitle(""); 
      setDesc(""); 
      setSelectedUid(""); 
      setPts("5"); 
      Alert.alert("Success", "Chore assigned successfully!");
    } catch (e: any) {
      console.error("Save Chore Error:", e);
      Alert.alert("Assignment Failed", e.message || "Unknown error occurred.");
    } finally {
      setSaving(false);
    }
  };

  const children = useMemo(() => 
    familyMembers.filter(m => m.role === 'child' && m.displayName?.trim()), 
    [familyMembers]
  );

  const parents = useMemo(() => 
    familyMembers.filter(m => m.role === 'parent' && m.displayName?.trim()), 
    [familyMembers]
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Assign Task</Text>
      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>Title</Text>
        <TextInput 
          style={styles.input} 
          value={title} 
          onChangeText={setTitle} 
          placeholder="e.g., Clean Bedroom" 
          placeholderTextColor="#94A3B8"
        />
        
        <Text style={styles.inputLabel}>Points</Text>
        <TextInput 
          style={styles.input} 
          value={pts} 
          onChangeText={setPts} 
          keyboardType="numeric" 
        />
        
        <Text style={styles.inputLabel}>Description (Optional)</Text>
        <TextInput 
          style={[styles.input, { height: 80 }]} 
          value={desc} 
          onChangeText={setDesc} 
          multiline 
          placeholder="Add details..." 
          placeholderTextColor="#94A3B8"
        />
        
        <Text style={styles.inputLabel}>Due Date</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
          <Text style={{ color: '#0F172A' }}>{formatDate(date)}</Text>
        </TouchableOpacity>
        {show && (
          <DateTimePicker 
            value={date} 
            mode="date" 
            display="default" 
            onChange={(_, d) => { setShow(false); if (d) setEditDueDate(d); }} 
          />
        )}

        <Text style={styles.inputLabel}>Repeats</Text>
        <View style={styles.chipRow}>
          {(['none', 'daily', 'weekly', 'monthly'] as const).map(r => (
            <TouchableOpacity 
              key={r} 
              style={[styles.chip, repeat === r && styles.chipActive]} 
              onPress={() => setRepeat(r)}
            >
              <Text style={[styles.chipText, repeat === r && styles.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <Text style={styles.inputLabel}>To Whom?</Text>
        {children.length > 0 && (
          <>
            <Text style={styles.groupLabel}>Children</Text>
            <View style={styles.chipRow}>
              {children.map((m) => (
                <TouchableOpacity 
                  key={m.uid} 
                  style={[styles.chip, selectedUid === m.uid && styles.chipActive]} 
                  onPress={() => setSelectedUid(m.uid)}
                >
                  <Text style={[styles.chipText, selectedUid === m.uid && styles.chipTextActive]}>{m.displayName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        
        {parents.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { marginTop: 10 }]}>Parents</Text>
            <View style={styles.chipRow}>
              {parents.map((m) => (
                <TouchableOpacity 
                  key={m.uid} 
                  style={[styles.chip, selectedUid === m.uid && styles.chipActive]} 
                  onPress={() => setSelectedUid(m.uid)}
                >
                  <Text style={[styles.chipText, selectedUid === m.uid && styles.chipTextActive]}>{m.displayName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        
        <TouchableOpacity 
          style={[styles.primaryBtn, { marginTop: 30 }, saving && styles.disabledBtn]} 
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Assign Chore</Text>
          )}
        </TouchableOpacity>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 40, backgroundColor: '#F8FAFC' },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  formCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#FFF' },
  groupLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  disabledBtn: { backgroundColor: '#94A3B8' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
