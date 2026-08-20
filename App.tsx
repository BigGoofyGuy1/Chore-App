import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";

import { db, auth } from "./src/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
} from "@react-native-firebase/firestore";
import { onAuthStateChanged, signOut } from "@react-native-firebase/auth";
import type { User } from "@react-native-firebase/auth";
import { Chore, Profile } from "./src/types";
import { useFamilyData } from "./src/hooks/useFamilyData";
import { useChoreActions } from "./src/hooks/useChoreActions";
import { syncChoreReminders } from "./src/utils/choreReminders";
import { syncPrivatePushToken } from "./src/utils/notifications";
import { migrateFamilyPrivateData } from "./src/utils/callableFunctions";

// Screens & Components
import { AuthScreen } from "./src/screens/AuthScreen";
import { EmailVerificationScreen } from "./src/screens/EmailVerificationScreen";
import { ProfileSetup } from "./src/screens/ProfileSetup";
import { ChildDashboard } from "./src/screens/ChildDashboard";
import { ParentDashboard } from "./src/screens/ParentDashboard";
import { AssignScreen } from "./src/screens/AssignScreen";
import { StoreScreen } from "./src/screens/StoreScreen";
import { FamilyScreen } from "./src/screens/FamilyScreen";
import { ParentSettingsScreen } from "./src/screens/ParentSettingsScreen";
import { ChoreDetailModal } from "./src/components/ChoreDetailModal";
import { NavBtn } from "./src/components/NavBtn";

// Without a notification handler, Expo drops foreground notifications by default.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function extractInviteCodeFromUrl(url: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (code) return code.trim().toUpperCase();
  } catch (error) {
    console.warn("Failed to parse invite URL", error);
  }

  const match = url.match(/[?&]code=([A-Z0-9]+)/i);
  return match ? match[1].toUpperCase() : null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("Today");
  const [selectedChore, setSelectedChore] = useState<Chore | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const signOutRequestedRef = useRef(false);
  const pushTokenSyncRef = useRef<string | null>(null);
  const privateMigrationRef = useRef<string | null>(null);
  const {
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
  } = Updates.useUpdates();

  const loadSignedInProfile = async (u: User) => {
    setUser(u);
    setProfile(null);
    setProfileLoadError(null);

    if (!u.isAnonymous && !u.emailVerified) {
      setActiveTab("Today");
      return;
    }

    if (!signOutRequestedRef.current) {
      const snap = await getDoc(doc(collection(db, "members"), u.uid));
      if (snap.exists) {
        const p = { uid: u.uid, ...(snap.data() as Omit<Profile, "uid">) } as Profile;
        setProfile(p);
        setActiveTab(p.role === "parent" ? "Review" : "Today");
      }
    }
  };

  const applyInviteCode = (rawCode: string | null) => {
    const normalized = rawCode?.trim().toUpperCase();
    if (!normalized) return;
    setPendingInviteCode(normalized);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoadingProfile(true);

      if (!u) {
        setUser(null);
        setProfile(null);
        setProfileLoadError(null);
        signOutRequestedRef.current = false;
        setLoadingProfile(false);
        return;
      }

      try {
        await loadSignedInProfile(u);
      } catch (e) {
        console.error("Failed to load signed-in profile", e);
        setProfileLoadError(e instanceof Error ? e.message : "Unable to load your family profile.");
      } finally {
        signOutRequestedRef.current = false;
        setLoadingProfile(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => applyInviteCode(extractInviteCodeFromUrl(url)))
      .catch((error) => console.error("Failed to read initial URL", error));

    const subscription = Linking.addEventListener("url", ({ url }) => {
      applyInviteCode(extractInviteCodeFromUrl(url));
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isUpdatePending) {
      Updates.reloadAsync().catch((e) => console.error("Update reload failed", e));
    }
  }, [isUpdatePending]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log("Notification received:", notification.request.identifier);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification opened:", response.notification.request.identifier);
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  const { chores, choreTemplates, familyMembers, rewards, familySettings, loading: loadingData } = useFamilyData(profile);
  const { handleApprove, handleRedo, uploadProof, uploading, decidingChoreId } = useChoreActions(profile, familyMembers);

  useEffect(() => {
    if (!profile || profile.role !== "child") return;
    if (loadingData) return;
    syncChoreReminders(profile, chores, familySettings.reminderSettings).catch((e) => {
      console.error("Failed to sync chore reminders", e);
    });
  }, [profile, chores, familySettings, loadingData]);

  useEffect(() => {
    if (!profile || pushTokenSyncRef.current === profile.uid) return;
    pushTokenSyncRef.current = profile.uid;
    syncPrivatePushToken(profile).catch((error) => {
      pushTokenSyncRef.current = null;
      console.error("Failed to sync private push token", error);
    });
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== "parent") return;
    if (privateMigrationRef.current === profile.familyCode) return;
    privateMigrationRef.current = profile.familyCode;
    migrateFamilyPrivateData().catch((error) => {
      privateMigrationRef.current = null;
      console.error("Failed to migrate family private data", error);
    });
  }, [profile]);

  const handleSaveProfile = (p: Profile) => {
    setProfile(p);
    setProfileLoadError(null);
    setPendingInviteCode(null);
    setActiveTab(p.role === "parent" ? "Review" : "Today");
  };

  const performSignOut = async () => {
    try {
      signOutRequestedRef.current = true;
      await signOut(auth);
      Alert.alert("Signed Out");
    } catch (e: unknown) {
      signOutRequestedRef.current = false;
      const message = e instanceof Error ? e.message : "Unable to sign out right now.";
      Alert.alert("Error Signing Out", message);
    }
  };

  const handleSignOut = async () => {
    if (auth.currentUser?.isAnonymous) {
      Alert.alert(
        "Remove Child From This Phone?",
        "This child account has no password. Signing out disconnects it permanently; a parent must create a new invite to reconnect the app.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => void performSignOut() },
        ]
      );
      return;
    }

    await performSignOut();
  };

  const handleVerificationRefresh = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setLoadingProfile(true);
    try {
      await currentUser.reload();
      const refreshedUser = auth.currentUser;

      if (!refreshedUser) {
        setUser(null);
        setProfile(null);
        return;
      }

      await loadSignedInProfile(refreshedUser);

      if (!refreshedUser.emailVerified) {
        Alert.alert("Not Verified Yet", "Open the link in your inbox, then try again.");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to refresh verification status.";
      if (auth.currentUser?.emailVerified) {
        setProfileLoadError(message);
      }
      Alert.alert("Refresh Failed", message);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleProfileRetry = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setLoadingProfile(true);
    setProfileLoadError(null);
    try {
      await loadSignedInProfile(currentUser);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to load your family profile.";
      console.error("Profile retry failed", error);
      setProfileLoadError(message);
    } finally {
      setLoadingProfile(false);
    }
  };

  const onApprove = async (chore: Chore) => {
    const success = await handleApprove(chore);
    if (success) setSelectedChore(null);
  };

  const onUploadProof = async (chore: Chore) => {
    const success = await uploadProof(chore);
    if (success) setSelectedChore(null);
  };

  const onRedo = async (chore: Chore, feedback: string) => {
    const success = await handleRedo(chore, feedback);
    if (success) setSelectedChore(null);
  };

  if (loadingProfile || (user && profile && loadingData)) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }
  
  if (!user) {
    return <AuthScreen />;
  }

  if (!user.isAnonymous && !user.emailVerified) {
    return (
      <EmailVerificationScreen
        user={user}
        onRefresh={handleVerificationRefresh}
        onSignOut={handleSignOut}
      />
    );
  }

  if (profileLoadError) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.profileErrorState}>
          <Text style={styles.profileErrorTitle}>Couldn&apos;t Load Your Family</Text>
          <Text style={styles.profileErrorText}>
            Check your connection and try again. Your existing account has not been changed.
          </Text>
          <Text style={styles.profileErrorDetail}>{profileLoadError}</Text>
          <TouchableOpacity
            style={styles.profileRetryBtn}
            accessibilityRole="button"
            onPress={handleProfileRetry}
          >
            <Text style={styles.profileRetryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileSignOutBtn}
            accessibilityRole="button"
            onPress={handleSignOut}
          >
            <Text style={styles.profileSignOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return <ProfileSetup user={user} onSave={handleSaveProfile} initialInviteCode={pendingInviteCode} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "Today":
        return <ChildDashboard profile={profile} chores={chores} rewards={rewards} familyMembers={familyMembers} scope="today" onPressChore={setSelectedChore} />;
      case "Week":
        return <ChildDashboard profile={profile} chores={chores} rewards={rewards} familyMembers={familyMembers} scope="week" onPressChore={setSelectedChore} />;
      case "Review":
        return <ParentDashboard profile={profile} chores={chores} familyMembers={familyMembers} onPressChore={setSelectedChore} onApprove={onApprove} decidingChoreId={decidingChoreId} />;
      case "Assign":
        return <AssignScreen profile={profile} familyMembers={familyMembers} templates={choreTemplates} />;
      case "Store":
        return <StoreScreen profile={profile} rewards={rewards} familyMembers={familyMembers} />;
      case "Family":
        return <FamilyScreen profile={profile} familyMembers={familyMembers} onSignOut={handleSignOut} />;
      case "Settings":
        return (
          <ParentSettingsScreen
            profile={profile}
            familyMembers={familyMembers}
            chores={chores}
            familySettings={familySettings}
          />
        );
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
            <NavBtn label="Settings" active={activeTab === "Settings"} onPress={() => setActiveTab("Settings")} />
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
        onRedo={onRedo}
        uploading={uploading}
        deciding={decidingChoreId === selectedChore?.id}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileErrorState: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  profileErrorTitle: { fontSize: 24, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  profileErrorText: { marginTop: 12, fontSize: 15, lineHeight: 22, color: '#475569', textAlign: 'center' },
  profileErrorDetail: { marginTop: 10, fontSize: 12, lineHeight: 18, color: '#94A3B8', textAlign: 'center' },
  profileRetryBtn: { marginTop: 24, borderRadius: 12, backgroundColor: '#2563EB', paddingVertical: 14, alignItems: 'center' },
  profileRetryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  profileSignOutBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  profileSignOutBtnText: { color: '#475569', fontSize: 15, fontWeight: '600' },
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
