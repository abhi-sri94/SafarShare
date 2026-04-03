import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { registerFirebaseThunk } from '../store/authSlice';
import auth from '@react-native-firebase/auth';

const BRAND = '#0F5C3A';

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'passenger', // helper: 'passenger' or 'driver'
  });
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();

  const handleRegister = async () => {
    const { firstName, lastName, email } = form;
    if (!firstName || !lastName || !email) {
      return Alert.alert('Missing Fields', 'Please fill in all details.');
    }

    setLoading(true);
    try {
      // Get the ID token from the current Firebase session
      const idToken = await auth().currentUser.getIdToken();
      
      const userData = {
        ...form,
        firebaseToken: idToken,
      };

      await dispatch(registerFirebaseThunk(userData)).unwrap();
      // Success: AppNavigator switches to Main stack
    } catch (error) {
      console.error(error);
      Alert.alert('Registration Failed', error.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join SafarShare and start your journey</Text>

          <View style={styles.form}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rahul"
              value={form.firstName}
              onChangeText={(t) => setForm({ ...form, firstName: t })}
            />

            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Kumar"
              value={form.lastName}
              onChangeText={(t) => setForm({ ...form, lastName: t })}
            />

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="rahul@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email}
              onChangeText={(t) => setForm({ ...form, email: t })}
            />

            <Text style={styles.label}>I want to...</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleBtn, form.role === 'passenger' && styles.roleBtnActive]}
                onPress={() => setForm({ ...form, role: 'passenger' })}
              >
                <Text style={[styles.roleText, form.role === 'passenger' && styles.roleTextActive]}>
                  Find Rides
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, form.role === 'driver' && styles.roleBtnActive]}
                onPress={() => setForm({ ...form, role: 'driver' })}
              >
                <Text style={[styles.roleText, form.role === 'driver' && styles.roleTextActive]}>
                  Offer Rides
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>Complete Registration</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  scroll: { padding: 24, paddingTop: 40 },
  backBtn: { marginBottom: 24 },
  backText: { fontSize: 32, color: BRAND, fontWeight: '300' },
  title: { fontSize: 28, fontWeight: '800', color: BRAND, marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6B7280', marginBottom: 32 },
  form: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },
  input: {
    height: 52,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
  },
  roleContainer: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 32 },
  roleBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  roleBtnActive: { backgroundColor: BRAND, borderColor: BRAND },
  roleText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  roleTextActive: { color: '#FFF' },
  submitBtn: {
    backgroundColor: BRAND,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
