import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useDispatch } from 'react-redux';
import { loginFirebaseThunk } from '../store/authSlice';

const BRAND = '#0F5C3A';
const SECONDARY = '#1B4D3E';
const ACCENT = '#F4B400';

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  // ── Phone Auth: Send OTP ────────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      return Alert.alert('Invalid Phone', 'Please enter a valid 10-digit mobile number.');
    }
    
    setLoading(true);
    try {
      const fullPhone = phone.startsWith('+') ? phone : `+91${phone}`;
      const confirmation = await auth().signInWithPhoneNumber(fullPhone);
      navigation.navigate('OTP', { confirmation, phone: fullPhone });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Google Social Login ─────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { idToken } = await GoogleSignin.signIn();
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      const userCredential = await auth().signInWithCredential(googleCredential);
      const firebaseToken = await userCredential.user.getIdToken();
      
      const result = await dispatch(loginFirebaseThunk({ firebaseToken })).unwrap();
      // If success, Navigator automatically switches to Main stack
    } catch (error) {
      if (error.code === '404') {
        Alert.alert('Register', 'No account found. Let\'s set you up!', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Register', onPress: () => navigation.navigate('Register') }
        ]);
      } else {
        Alert.alert('Login Failed', error.message || 'Could not sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[BRAND, SECONDARY]} style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <Text style={styles.logoText}>SafarShare</Text>
            <Text style={styles.tagline}>Your Journey, Better Shared</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Enter your mobile number to continue</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.input}
                placeholder="Mobile Number"
                placeholderTextColor="#9B9890"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={10}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Send OTP</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={loading}
            >
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.link}>Create one</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  keyboardView: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoText: { fontSize: 42, fontWeight: '800', color: '#FFF', letterSpacing: -1 },
  tagline: { fontSize: 16, color: '#A3D9A5', marginTop: 4 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  title: { fontSize: 24, fontWeight: '700', color: BRAND, marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  prefix: { fontSize: 16, fontWeight: '600', color: BRAND, marginRight: 8 },
  input: { flex: 1, height: 50, fontSize: 16, color: '#111827' },
  button: {
    backgroundColor: BRAND,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  divider: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  orText: { marginHorizontal: 12, color: '#9CA3AF', fontSize: 14 },
  googleButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#FFF',
  },
  googleButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  footerText: { color: '#6B7280', fontSize: 14 },
  link: { color: BRAND, fontWeight: '700', fontSize: 14 },
});
