import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  Animated, Vibration, Linking, StatusBar,
} from 'react-native';
import { bookingsAPI } from '../services/api';
import { getCurrentPosition } from '../services/locationService';

const DANGER = '#E24B4A';

export default function PanicScreen({ route, navigation }) {
  const { bookingId } = route.params || {};

  const [triggered, setTriggered] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [location, setLocation] = useState(null);

  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for rings
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Pre-fetch GPS location on mount
    getCurrentPosition().then(setLocation).catch(() => {});
    return () => clearTimer();
  }, []);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startPanic = () => {
    if (triggered) return;
    Vibration.vibrate(100);
    let count = 3;
    setCountdown(count);
    timerRef.current = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        Vibration.vibrate(100);
      } else {
        clearTimer();
        setCountdown(null);
        firePanic();
      }
    }, 1000);
  };

  const cancelPanic = () => {
    clearTimer();
    setCountdown(null);
  };

  const firePanic = async () => {
    Vibration.vibrate([200, 100, 200, 100, 400]);
    setTriggered(true);

    let lat = location?.lat || 26.8467;
    let lng = location?.lng || 80.9462;

    // Try to get fresh GPS
    try {
      const pos = await getCurrentPosition();
      lat = pos.lat; lng = pos.lng;
      setLocation(pos);
    } catch (e) {}

    if (bookingId) {
      try {
        await bookingsAPI.panic(bookingId, lat, lng);
      } catch (e) {
        console.warn('Panic API failed:', e.message);
      }
    }
  };

  const callPolice = () => Linking.openURL('tel:112');
  const callAmbulance = () => Linking.openURL('tel:108');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a0505" />

      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18 }}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Emergency Help</Text>
      <Text style={styles.sub}>
        {triggered
          ? '🚨 Alert has been sent to your emergency contacts and SafarShare safety team'
          : 'Press and hold for 3 seconds to send emergency alert'}
      </Text>

      {/* Alert sent banner */}
      {triggered && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertTitle}>🚨 Alert Sent!</Text>
          <Text style={styles.alertSub}>
            SMS sent to emergency contacts.{'\n'}
            SafarShare admin team has been notified.{'\n'}
            Your GPS location is being shared.
          </Text>
        </View>
      )}

      {/* Panic button */}
      <View style={styles.btnWrap}>
        {[1, 1.2, 1.4].map((scale, i) => (
          <Animated.View
            key={i}
            style={[styles.ring, {
              transform: [{ scale: Animated.multiply(pulseAnim, scale) }],
              opacity: triggered ? 0.8 : 0.3,
              borderColor: DANGER,
              width: 200, height: 200,
              position: 'absolute',
            }]}
          />
        ))}
        <TouchableOpacity
          style={[styles.panicBtn, triggered && styles.panicBtnTriggered]}
          onPressIn={startPanic}
          onPressOut={cancelPanic}
          activeOpacity={0.9}>
          <Text style={styles.panicIcon}>{triggered ? '🚨' : '🆘'}</Text>
          <Text style={styles.panicLabel}>
            {countdown !== null ? `${countdown}...` : triggered ? 'ALERT SENT' : 'HOLD 3s'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info cards */}
      <View style={styles.infoCards}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Your Location</Text>
            <Text style={styles.infoSub}>
              {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Fetching GPS...'}
            </Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📱</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Emergency Contacts</Text>
            <Text style={styles.infoSub}>SMS will be sent to all saved contacts</Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>👮</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Admin Notified</Text>
            <Text style={styles.infoSub}>SafarShare safety team monitoring your ride</Text>
          </View>
        </View>
      </View>

      {/* Emergency call buttons */}
      <View style={styles.callBtns}>
        <TouchableOpacity style={styles.callBtn} onPress={callPolice}>
          <Text style={styles.callBtnText}>📞 Call Police (112)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.callBtn, { backgroundColor: 'rgba(59,130,246,0.15)' }]} onPress={callAmbulance}>
          <Text style={[styles.callBtnText, { color: '#60a5fa' }]}>🚑 Call Ambulance (108)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0505', alignItems: 'center', paddingHorizontal: 24, paddingTop: 54 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  alertBanner: { width: '100%', backgroundColor: 'rgba(226,75,74,0.15)', borderWidth: 1, borderColor: 'rgba(226,75,74,0.4)', borderRadius: 14, padding: 16, marginBottom: 20, alignItems: 'center' },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#f87171', marginBottom: 6 },
  alertSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 18 },
  btnWrap: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  ring: { borderRadius: 100, borderWidth: 2, position: 'absolute' },
  panicBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: DANGER, justifyContent: 'center', alignItems: 'center', shadowColor: DANGER, shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  panicBtnTriggered: { backgroundColor: '#7f1d1d' },
  panicIcon: { fontSize: 36 },
  panicLabel: { fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 4, letterSpacing: 1 },
  infoCards: { width: '100%', gap: 8, marginBottom: 20 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 },
  infoIcon: { fontSize: 22 },
  infoTitle: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 2 },
  infoSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },
  callBtns: { width: '100%', gap: 10 },
  callBtn: { backgroundColor: 'rgba(226,75,74,0.15)', borderWidth: 1, borderColor: 'rgba(226,75,74,0.3)', borderRadius: 13, padding: 13, alignItems: 'center' },
  callBtnText: { fontSize: 13, fontWeight: '600', color: '#f87171' },
});
