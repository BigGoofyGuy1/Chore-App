import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { db, auth } from "./src/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
} from "@react-native-firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "@react-native-firebase/auth";
import { Chore, Profile } from "./src/types";
import { useFamilyData } from "./src/hooks/useFamilyData";
import { useChoreActions } from "./src/hooks/useChoreActions";

// Screens & Components
import { ProfileSetup } from "./src/screens/ProfileSetup";
import { ChildDashboard } from "./src/screens/ChildDashboard";
import { ParentDashboard } from "./src/screens/ParentDashboard";
import { AssignScreen } from "./src/screens/AssignScreen";
import { StoreScreen } from "./src/screens/StoreScreen";
import { FamilyScreen } from "./src/screens/FamilyScreen";
import { ChoreDetailModal } from "./src/components/ChoreDetailModal";
import { NavBtn } from "./src/components/NavBtn";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("Today");
  const [selectedChore, setSelectedChore] = useState<Chore | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAnonymously(auth).catch(e => {
          console.error("Anon auth failed", e);
          setLoadingProfile(false);
        });
      } else {
        setUser(u);
        getDoc(doc(collection(db, "members"), u.uid)).then((snap) => {
          if (snap.exists) {
            const p = snap.data() as Profile;
            setProfile(p);
            setActiveTab(p.role === "parent" ? "Review" : "Today");
          }
          setLoadingProfile(false);
        }).catch(() => setLoadingProfile(false));
      }
    });
    return unsubscribe;
  }, []);

  const { chores, familyMembers, rewards, loading: loadingData } = useFamilyData(profile);
  const { handleApprove, uploadProof, uploading } = useChoreActions(profile, familyMembers);

  const onApprove = async (chore: Chore) => {
    const success = await handleApprove(chore);
    if (success) setSelectedChore(null);
  };

  const onUploadProof = async (chore: Chore) => {
    const success = await uploadProof(chore);
    if (success) setSelectedChore(null);
  };

  if (loadingProfile || (user && profile && loadingData)) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }
  
  if (!user || !profile) {
    return <ProfileSetup user={user} onSave={setProfile} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "Today":
      case "Week":
        return <ChildDashboard profile={profile} chores={chores} onPressChore={setSelectedChore} />;
      case "Review":
        return <ParentDashboard profile={profile} chores={chores} familyMembers={familyMembers} onPressChore={setSelectedChore} />;
      case "Assign":
        return <AssignScreen profile={profile} familyMembers={familyMembers} />;
      case "Store":
        return <StoreScreen profile={profile} rewards={rewards} familyMembers={familyMembers} />;
      case "Family":
        return <FamilyScreen familyMembers={familyMembers} profile={profile} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        {renderContent()}
      </View>

      <View style={styles.navBar}>
        {profile.role === "child" ? (
          <>
            <NavBtn label="Today" active={activeTab === "Today"} onPress={() => setActiveTab("Today")} />
            <NavBtn label="Week" active={activeTab === "Week"} onPress={() => setActiveTab("Week")} />
            <NavBtn label="Store" active={activeTab === "Store"} onPress={() => setActiveTab("Store")} />
            <NavBtn label="Family" active={activeTab === "Family"} onPress={() => setActiveTab("Family")} />
          </>
        ) : (
          <>
            <NavBtn label="Review" active={activeTab === "Review"} onPress={() => setActiveTab("Review")} />
            <NavBtn label="Assign" active={activeTab === "Assign"} onPress={() => setActiveTab("Assign")} />
            <NavBtn label="Store" active={activeTab === "Store"} onPress={() => setActiveTab("Store")} />
            <NavBtn label="Family" active={activeTab === "Family"} onPress={() => setActiveTab("Family")} />
          </>
        )}
      </View>

      <ChoreDetailModal 
        visible={!!selectedChore}
        chore={selectedChore}
        profile={profile}
        onClose={() => setSelectedChore(null)}
        onUploadProof={onUploadProof}
        onApprove={onApprove}
        uploading={uploading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navBar: { flexDirection: 'row', height: 80, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 20, paddingBottom: 20 },
});
