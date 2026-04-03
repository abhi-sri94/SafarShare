import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { OtpInput } from 'react-native-otp-entry';
import { useDispatch } from 'react-redux';
import { loginFirebaseThunk } from '../store/authSlice';

const BRAND = '#0F5C3A';

export default function OTPScreen({ route, navigation }) {
  const { confirmation, phone } = route.params;
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const dispatch = useDispatch();

  // ── Countdown for Resend ────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Verify OTP ──────────────────────────────────────────────────────────
  const handleVerify = async (code) => {
    if (code.length < 6) return;

    setLoading(true);
    try {
      const userCredential = await confirmation.confirm(code);
      const firebaseToken = await userCredential.user.getIdToken();
      
      await dispatch(loginFirebaseThunk({ firebaseToken })).unwrap();
      // Success: AppNavigator switches to Main stack
    } catch (error) {
      console.error(error);
      Alert.alert('Verification Failed', 'The OTP you entered is incorrect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Verify Phone</Text>
        <Text style={styles.subtitle}>
          We've sent a 6-digit code to {'\n'}
          <Text style={styles.phoneText}>{phone}</Text>
        </Text>

        <OtpInput
          numberOfDigits={6}
          focusColor={BRAND}
          onFilled={(code) => handleVerify(code)}
          theme={{
            containerStyle: styles.otpContainer,
            pinCodeContainerStyle: styles.otpBox,
            pinCodeTextStyle: styles.otpText,
            focusStickStyle: styles.focusStick,
          }}
        />

        {loading && (
          <ActivityIndicator color={BRAND} style={{ marginTop: 24 }} />
        )}

        <View style={styles.footer}>
          <Text style={styles.resendText}>Didn't receive code? </Text>
          {timer > 0 ? (
            <Text style={styles.timer}>Wait {timer}s</Text>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.link}>Resend Now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  content: { flex: 1, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 32 },
  backText: { fontSize: 32, color: BRAND, fontWeight: '300' },
  title: { fontSize: 28, fontWeight: '800', color: BRAND, marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#6B7280', lineHeight: 24, marginBottom: 40 },
  phoneText: { fontWeight: '700', color: '#111827' },
  otpContainer: { marginBottom: 40 },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  otpText: { fontSize: 20, fontWeight: '700', color: BRAND },
  focusStick: { backgroundColor: BRAND },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  resendText: { color: '#6B7280', fontSize: 14 },
  timer: { color: BRAND, fontWeight: '600', fontSize: 14 },
  link: { color: BRAND, fontWeight: '700', fontSize: 14 },
});
