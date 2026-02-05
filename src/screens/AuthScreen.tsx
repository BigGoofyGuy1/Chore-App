import React, { useState } from "react";
import { 
  Alert, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View 
} from "react-native";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "@react-native-firebase/auth";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async () => {
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      Alert.alert("Auth Error", e.message);
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
      />
      <TextInput 
        style={[styles.input, { width: '100%' }]} 
        placeholder="Password" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry 
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth}>
        <Text style={styles.primaryBtnText}>{isLogin ? "Sign In" : "Sign Up"}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ marginTop: 20 }}>
        <Text style={styles.linkText}>
          {isLogin ? "Need an account? Sign Up" : "Have an account? Sign In"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', width: '100%' },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  linkText: { color: '#2563EB', fontWeight: '600' },
});
