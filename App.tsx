import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";

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
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const {
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
  } = Updates.useUpdates();

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        signInAnonymously(auth).catch(e => {
          console.error("Anon auth failed", e);
          setLoadingProfile(false);
        });
        return;
      }

      setUser(u);
      try {
        const storedMemberUid = await AsyncStorage.getItem("memberUid");
        if (storedMemberUid) {
          const snap = await getDoc(doc(collection(db, "members"), storedMemberUid));
          if (snap.exists) {
            const p = snap.data() as Profile;
            setProfile(p);
            setActiveTab(p.role === "parent" ? "Review" : "Today");
          } else {
            await AsyncStorage.removeItem("memberUid");
          }
        }
      } catch (e) {
        console.error("Failed to load saved profile", e);
      } finally {
        setLoadingProfile(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isUpdatePending) {
      Updates.reloadAsync().catch((e) => console.error("Update reload failed", e));
    }
  }, [isUpdatePending]);

  const { chores, familyMembers, rewards, loading: loadingData } = useFamilyData(profile);
  const { handleApprove, uploadProof, uploading } = useChoreActions(profile, familyMembers);

  const handleSaveProfile = (p: Profile) => {
    setProfile(p);
    setActiveTab(p.role === "parent" ? "Review" : "Today");
  };

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
    return <ProfileSetup user={user} onSave={handleSaveProfile} />;
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

  const updateBannerText = isUpdatePending
    ? "Applying update..."
    : isDownloading
      ? "Downloading update..."
      : isChecking
        ? "Checking for updates..."
        : isUpdateAvailable
          ? "Update available. Downloading..."
          : null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      {!!updateBannerText && (
        <View style={styles.updateBanner}>
          <Text style={styles.updateBannerText}>{updateBannerText}</Text>
        </View>
      )}
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
  updateBanner: {
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  updateBannerText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
