import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useDispatch } from 'react-redux';
import { trackingAPI } from '../services/api';
import { connectSocket, joinRideTracking, getSocket } from '../services/socketService';
import { getCurrentPosition } from '../services/locationService';
import { decode } from '@mapbox/polyline';

const BRAND = '#0F5C3A';

export default function TrackingScreen({ route, navigation }) {
  const { rideId, bookingId } = route.params || {};
  const mapRef = useRef(null);

  const [trackingData, setTrackingData] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load initial tracking data
  useEffect(() => {
    if (!rideId) return;
    loadTracking();
    setupSocket();
    getPassengerLocation();

    return () => {
      getSocket()?.off('location_update');
    };
  }, [rideId]);

  const loadTracking = async () => {
    try {
      const data = await trackingAPI.get(rideId);
      const t = data.data;
      setTrackingData(t);

      // Set driver location
      if (t.ride?.currentLocation?.coordinates) {
        const [lng, lat] = t.ride.currentLocation.coordinates;
        setDriverLocation({ latitude: lat, longitude: lng });
      }

      // Decode polyline for route overlay
      if (t.ride?.routePolyline) {
        const coords = decode(t.ride.routePolyline).map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
        setRouteCoords(coords);
      }

      // Fit map to show full route
      if (mapRef.current && t.ride?.origin && t.ride?.destination) {
        const [oLng, oLat] = t.ride.origin.coordinates.coordinates;
        const [dLng, dLat] = t.ride.destination.coordinates.coordinates;
        mapRef.current.fitToCoordinates(
          [{ latitude: oLat, longitude: oLng }, { latitude: dLat, longitude: dLng }],
          { edgePadding: { top: 80, right: 60, bottom: 300, left: 60 }, animated: true }
        );
      }
    } catch (e) {
      Alert.alert('Error', 'Could not load tracking data');
    } finally {
      setLoading(false);
    }
  };

  const setupSocket = async () => {
    const socket = await connectSocket();
    if (!socket) return;
    joinRideTracking(rideId);
    socket.on('location_update', ({ lat, lng }) => {
      const coord = { latitude: lat, longitude: lng };
      setDriverLocation(coord);
      // Smoothly pan map to driver
      mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 500);
    });
  };

  const getPassengerLocation = async () => {
    try {
      const { lat, lng } = await getCurrentPosition();
      setPassengerLocation({ latitude: lat, longitude: lng });
    } catch (e) {}
  };

  const callDriver = () => {
    const phone = trackingData?.ride?.driver?.phone;
    if (phone) Linking.openURL(`tel:${phone}`);
    else Alert.alert('Phone not available');
  };

  const shareLocation = async () => {
    const pos = passengerLocation;
    if (!pos) return;
    const url = `https://maps.google.com/?q=${pos.latitude},${pos.longitude}`;
    Alert.alert('Location Shared', 'Live location link copied to clipboard.');
  };

  const ride = trackingData?.ride;
  const tracking = trackingData?.tracking;
  const driver = ride?.driver || {};
  const driverName = driver.firstName ? `${driver.firstName} ${driver.lastName}` : 'Driver';
  const driverInitials = ((driver.firstName?.[0]||'') + (driver.lastName?.[0]||'')).toUpperCase() || 'DR';

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={true}
        showsMyLocationButton={false}
        initialRegion={{
          latitude: 26.8467, longitude: 80.9462,
          latitudeDelta: 1.5, longitudeDelta: 1.5,
        }}>

        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeColor={BRAND} strokeWidth={4} lineDashPattern={[1]} />
        )}

        {/* Driver marker */}
        {driverLocation && (
          <Marker coordinate={driverLocation} title={driverName} description={ride?.vehicleModel}>
            <View style={styles.carMarker}>
              <Text style={{ fontSize: 24 }}>🚗</Text>
            </View>
          </Marker>
        )}

        {/* Origin marker */}
        {ride?.origin?.coordinates?.coordinates && (
          <Marker
            coordinate={{ latitude: ride.origin.coordinates.coordinates[1], longitude: ride.origin.coordinates.coordinates[0] }}
            title={ride.origin.city} pinColor="blue" />
        )}

        {/* Destination marker */}
        {ride?.destination?.coordinates?.coordinates && (
          <Marker
            coordinate={{ latitude: ride.destination.coordinates.coordinates[1], longitude: ride.destination.coordinates.coordinates[0] }}
            title={ride.destination.city} pinColor="red" />
        )}
      </MapView>

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#fff', fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Live Tracking</Text>
          <Text style={styles.topSub}>
            {ride ? `${ride.origin?.city} → ${ride.destination?.city}` : 'Loading...'}
          </Text>
        </View>
        <TouchableOpacity style={styles.panicBtn} onPress={() => navigation.navigate('Panic', { bookingId })}>
          <Text style={{ fontSize: 18 }}>🆘</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        {/* ETA chip */}
        <View style={styles.etaChip}>
          <View style={styles.pulseDot} />
          <Text style={styles.etaText}>
            ETA: {tracking?.estimatedMinutesRemaining ?? '—'} min · {tracking?.distanceRemainingKm ?? '—'} km remaining
          </Text>
        </View>

        {/* Driver row */}
        <View style={styles.driverRow}>
          <View style={styles.driverAv}>
            <Text style={styles.driverAvText}>{driverInitials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{driverName}</Text>
            <Text style={styles.driverMeta}>
              {driver.driverRating?.toFixed(1)} ★ · {driver.driverInfo?.vehicleModel || ''} · {ride?.vehicleNumber || ''}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${tracking?.progress || 0}%` }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>{tracking?.progress || 0}% completed</Text>
          <Text style={styles.progressText}>{tracking?.distanceCoveredKm || 0} / {ride?.distanceKm || 0} km</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{tracking?.distanceRemainingKm ?? '—'}</Text>
            <Text style={styles.statLbl}>km left</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{tracking?.estimatedMinutesRemaining ?? '—'}</Text>
            <Text style={styles.statLbl}>min ETA</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{tracking?.progress || 0}%</Text>
            <Text style={styles.statLbl}>done</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={callDriver}>
            <Text style={styles.actionBtnText}>📞 Call Driver</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={shareLocation}>
            <Text style={styles.actionBtnText}>📤 Share Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.chatBtn]}
            onPress={() => navigation.navigate('Chat', { bookingId })}>
            <Text style={styles.actionBtnText}>💬 Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(10,26,18,0.92)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  topSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  panicBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(226,75,74,0.25)', borderWidth: 1, borderColor: 'rgba(226,75,74,0.4)', justifyContent: 'center', alignItems: 'center' },
  carMarker: { backgroundColor: '#1A7D52', width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  etaChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(26,125,82,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 14 },
  pulseDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ade80' },
  etaText: { fontSize: 13, fontWeight: '600', color: '#0F5C3A' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  driverAv: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#0F5C3A', justifyContent: 'center', alignItems: 'center' },
  driverAvText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  driverName: { fontSize: 15, fontWeight: '700', color: '#1A1A18' },
  driverMeta: { fontSize: 12, color: '#6B6860', marginTop: 1 },
  progressBar: { height: 4, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#0F5C3A', borderRadius: 2 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  progressText: { fontSize: 11, color: '#6B6860' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: '#F2F0EB', borderRadius: 12, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700', color: '#0F5C3A' },
  statLbl: { fontSize: 11, color: '#6B6860', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, backgroundColor: '#F2F0EB', borderRadius: 12, padding: 11, alignItems: 'center' },
  chatBtn: { backgroundColor: '#E6F4EE' },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#1A1A18' },
});
