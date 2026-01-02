import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./src/firebase";
import { Chore, Profile, Role } from "./src/types";

const FAMILY_STORAGE_KEY = "chore-app-profile";

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [chores, setChores] = useState<Chore[]>([]);
  const [loadingChores, setLoadingChores] = useState(false);
  const [newChoreTitle, setNewChoreTitle] = useState("");
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(FAMILY_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          setProfile(JSON.parse(stored));
        }
      })
      .finally(() => setLoadingProfile(false));
  }, []);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setLoadingChores(true);
    const familyQuery = query(
      collection(db, "chores"),
      where("familyCode", "==", profile.familyCode),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      familyQuery,
      (snapshot) => {
        const next: Chore[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            title: data.title ?? "Untitled chore",
            assignedTo: data.assignedTo ?? "",
            familyCode: data.familyCode ?? "",
            status: data.status ?? "pending",
            photoUrl: data.photoUrl,
            completedBy: data.completedBy,
            createdAt: data.createdAt,
            completedAt: data.completedAt
          } as Chore;
        });

        setChores(next);
        setLoadingChores(false);
      },
      (error) => {
        console.error("Failed to subscribe to chores", error);
        Alert.alert("Sync error", "Could not subscribe to chores updates.");
        setLoadingChores(false);
      }
    );

    return () => unsubscribe();
  }, [profile]);

  const saveProfile = async (payload: Profile) => {
    setProfile(payload);
    await AsyncStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(payload));
  };

  const resetProfile = async () => {
    await AsyncStorage.removeItem(FAMILY_STORAGE_KEY);
    setProfile(null);
  };

  const addChore = async () => {
    if (!profile) {
      return;
    }
    if (!newChoreTitle.trim() || !assignee.trim()) {
      Alert.alert("Missing info", "Add a chore title and who it is for.");
      return;
    }
    try {
      await addDoc(collection(db, "chores"), {
        title: newChoreTitle.trim(),
        assignedTo: assignee.trim(),
        familyCode: profile.familyCode,
        status: "pending",
        photoUrl: null,
        createdAt: serverTimestamp()
      });
      setNewChoreTitle("");
      setAssignee("");
    } catch (error) {
      console.error("Failed to add chore", error);
      Alert.alert("Save failed", "Could not add this chore right now.");
    }
  };

  const uploadProof = useCallback(
    async (chore: Chore) => {
      if (!profile) {
        return;
      }
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission needed", "We need access to your photos.");
        return;
      }
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7
      });
      if (pickerResult.canceled || !pickerResult.assets?.length) {
        return;
      }
      const asset = pickerResult.assets[0];

      try {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const storageRef = ref(
          storage,
          `choreProofs/${profile.familyCode}/${chore.id}-${Date.now()}.jpg`
        );
        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        const choreRef = doc(db, "chores", chore.id);
        await updateDoc(choreRef, {
          status: "completed",
          photoUrl: downloadUrl,
          completedBy: profile.displayName,
          completedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to upload proof", error);
        Alert.alert("Upload failed", "Could not upload photo right now.");
      }
    },
    [profile]
  );

  const childChores = useMemo(() => {
    if (!profile || profile.role !== "child") return [];
    return chores.filter(
      (chore) =>
        chore.assignedTo?.toLowerCase().trim() ===
        profile.displayName.toLowerCase().trim()
    );
  }, [chores, profile]);

  if (loadingProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return <ProfileSetup onSave={saveProfile} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {profile.displayName}</Text>
          <Text style={styles.subtle}>
            Family code: {profile.familyCode.toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity style={styles.linkButton} onPress={resetProfile}>
          <Text style={styles.linkButtonText}>Switch</Text>
        </TouchableOpacity>
      </View>

      {profile.role === "parent" ? (
        <ParentView
          chores={chores}
          loadingChores={loadingChores}
          assignee={assignee}
          setAssignee={setAssignee}
          newChoreTitle={newChoreTitle}
          setNewChoreTitle={setNewChoreTitle}
          addChore={addChore}
        />
      ) : (
        <ChildView
          chores={childChores}
          loadingChores={loadingChores}
          onUploadProof={uploadProof}
        />
      )}
    </SafeAreaView>
  );
}

function ProfileSetup({ onSave }: { onSave: (profile: Profile) => void }) {
  const [role, setRole] = useState<Role>("parent");
  const [familyCode, setFamilyCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleSave = () => {
    if (!familyCode.trim() || !displayName.trim()) {
      Alert.alert("Missing info", "Fill in your name and family code.");
      return;
    }
    onSave({
      role,
      displayName: displayName.trim(),
      familyCode: familyCode.trim().toLowerCase()
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Chore App</Text>
      <Text style={styles.subtle}>
        Pick a role, set a shared family code, and start syncing chores.
      </Text>
      <View style={styles.roleSwitch}>
        <TouchableOpacity
          style={[
            styles.roleButton,
            role === "parent" && styles.roleButtonActive
          ]}
          onPress={() => setRole("parent")}
        >
          <Text
            style={[
              styles.roleButtonText,
              role === "parent" && styles.roleButtonTextActive
            ]}
          >
            Parent
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.roleButton,
            role === "child" && styles.roleButtonActive
          ]}
          onPress={() => setRole("child")}
        >
          <Text
            style={[
              styles.roleButtonText,
              role === "child" && styles.roleButtonTextActive
            ]}
          >
            Child
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        placeholder="Family code (share with your family)"
        style={styles.input}
        autoCapitalize="none"
        value={familyCode}
        onChangeText={setFamilyCode}
      />
      <TextInput
        placeholder="Your name"
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

type ParentViewProps = {
  chores: Chore[];
  loadingChores: boolean;
  assignee: string;
  setAssignee: (val: string) => void;
  newChoreTitle: string;
  setNewChoreTitle: (val: string) => void;
  addChore: () => void;
};

function ParentView({
  chores,
  loadingChores,
  assignee,
  setAssignee,
  newChoreTitle,
  setNewChoreTitle,
  addChore
}: ParentViewProps) {
  return (
    <ScrollView style={styles.section}>
      <Text style={styles.sectionTitle}>Create a chore</Text>
      <View style={styles.card}>
        <TextInput
          placeholder="Chore title"
          style={styles.input}
          value={newChoreTitle}
          onChangeText={setNewChoreTitle}
        />
        <TextInput
          placeholder="Assign to (child's name)"
          style={styles.input}
          value={assignee}
          onChangeText={setAssignee}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={addChore}>
          <Text style={styles.primaryButtonText}>Add chore</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Family chores</Text>
      {loadingChores ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={chores}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChoreCard chore={item} role="parent" />}
          ListEmptyComponent={
            <Text style={styles.subtle}>No chores yet. Add one above.</Text>
          }
        />
      )}
    </ScrollView>
  );
}

type ChildViewProps = {
  chores: Chore[];
  loadingChores: boolean;
  onUploadProof: (chore: Chore) => void;
};

function ChildView({ chores, loadingChores, onUploadProof }: ChildViewProps) {
  return (
    <ScrollView style={styles.section}>
      <Text style={styles.sectionTitle}>Your chores</Text>
      {loadingChores ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={chores}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChoreCard chore={item} role="child" onUploadProof={onUploadProof} />
          )}
          ListEmptyComponent={
            <Text style={styles.subtle}>No chores assigned to you yet.</Text>
          }
        />
      )}
    </ScrollView>
  );
}

type ChoreCardProps = {
  chore: Chore;
  role: Role;
  onUploadProof?: (chore: Chore) => void;
};

function ChoreCard({ chore, role, onUploadProof }: ChoreCardProps) {
  const status = chore.status || "pending";
  const statusColor = status === "completed" ? "#22c55e" : "#f97316";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{chore.title}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>
      <Text style={styles.subtle}>Assigned to: {chore.assignedTo}</Text>
      {chore.completedBy && (
        <Text style={styles.subtle}>Completed by: {chore.completedBy}</Text>
      )}
      {chore.photoUrl && (
        <Image source={{ uri: chore.photoUrl }} style={styles.previewImage} />
      )}

      {role === "child" && chore.status !== "completed" && onUploadProof && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => onUploadProof(chore)}
        >
          <Text style={styles.secondaryButtonText}>Upload photo proof</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingTop: 32
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a"
  },
  subtle: {
    color: "#475569",
    marginTop: 4
  },
  linkButton: {
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  linkButtonText: {
    color: "#2563eb",
    fontWeight: "600"
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8
  },
  section: {
    flex: 1
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    color: "#0f172a"
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusText: {
    color: "#fff",
    fontWeight: "700",
    textTransform: "capitalize"
  },
  roleSwitch: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 4,
    marginVertical: 12
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8
  },
  roleButtonActive: {
    backgroundColor: "#fff"
  },
  roleButtonText: {
    fontWeight: "700",
    color: "#475569"
  },
  roleButtonTextActive: {
    color: "#0f172a"
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16
  },
  secondaryButton: {
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "700"
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginTop: 10
  }
});
