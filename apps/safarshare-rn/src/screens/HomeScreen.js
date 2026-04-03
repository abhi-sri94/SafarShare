import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, FlatList, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { searchRidesThunk, setSelectedRide } from '../store/ridesSlice';
import { getCurrentPosition } from '../services/locationService';
import { format, addDays } from 'date-fns';
import RideCard from '../components/RideCard';
import SafetyBanner from '../components/SafetyBanner';

const BRAND = '#0F5C3A';
const POPULAR_ROUTES = [
  { from: 'Lucknow', to: 'Kanpur' },
  { from: 'Varanasi', to: 'Prayagraj' },
  { from: 'Gorakhpur', to: 'Lucknow' },
  { from: 'Agra', to: 'Mathura' },
  { from: 'Bahraich', to: 'Lucknow' },
];

export default function HomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const { searchResults, isSearching } = useSelector(s => s.rides);

  const [from, setFrom] = useState('Lucknow');
  const [to, setTo]     = useState('Kanpur');
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [seats, setSeats] = useState(1);

  // Load rides on mount
  useFocusEffect(useCallback(() => {
    doSearch();
  }, []));

  const doSearch = () => {
    if (!from || !to || !date) return;
    dispatch(searchRidesThunk({ from, to, date, seats }));
  };

  const swapCities = () => { setFrom(to); setTo(from); };

  const openRide = async (ride) => {
    dispatch(setSelectedRide(ride));
    navigation.navigate('RideDetail', { rideId: ride._id });
  };

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d3322" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.name}>{user?.firstName} 👋</Text>
          </View>
          <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.avatarText}>
              {((user?.firstName?.[0]||'') + (user?.lastName?.[0]||'')).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search card */}
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <View style={[styles.dot, { backgroundColor: BRAND }]} />
            <TextInput style={styles.searchInput} placeholder="From city…" placeholderTextColor="#9B9890"
              value={from} onChangeText={setFrom} onSubmitEditing={doSearch} />
            <TouchableOpacity onPress={swapCities} style={styles.swapBtn}>
              <Text style={{ fontSize: 18, color: BRAND }}>⇅</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.searchRow, { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }]}>
            <View style={[styles.dot, { backgroundColor: '#F5A623' }]} />
            <TextInput style={styles.searchInput} placeholder="To city…" placeholderTextColor="#9B9890"
              value={to} onChangeText={setTo} onSubmitEditing={doSearch} />
          </View>
          <View style={styles.dateRow}>
            <TextInput style={styles.dateInput} value={date} onChangeText={setDate}
              placeholder="YYYY-MM-DD" placeholderTextColor="#9B9890" />
            <View style={styles.seatsRow}>
              <TouchableOpacity onPress={() => setSeats(Math.max(1, seats - 1))} style={styles.seatBtn}>
                <Text style={styles.seatBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.seatsText}>{seats} seat{seats > 1 ? 's' : ''}</Text>
              <TouchableOpacity onPress={() => setSeats(Math.min(4, seats + 1))} style={styles.seatBtn}>
                <Text style={styles.seatBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={doSearch} activeOpacity={0.85}>
            <Text style={styles.searchBtnText}>Search Rides →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <SafetyBanner onPress={() => navigation.navigate('Panic')} />

        {/* Popular routes */}
        <Text style={styles.sectionTitle}>Popular Routes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {POPULAR_ROUTES.map((r, i) => (
            <TouchableOpacity key={i} style={[styles.chip, from === r.from && to === r.to && styles.chipActive]}
              onPress={() => { setFrom(r.from); setTo(r.to); dispatch(searchRidesThunk({ from: r.from, to: r.to, date, seats })); }}>
              <Text style={[styles.chipText, from === r.from && to === r.to && styles.chipTextActive]}>
                {r.from} → {r.to}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results */}
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>Available Rides</Text>
          {isSearching && <ActivityIndicator size="small" color={BRAND} />}
        </View>

        {searchResults.map(ride => (
          <RideCard key={ride._id} ride={ride} onPress={() => openRide(ride)} />
        ))}

        {!isSearching && !searchResults.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No rides found</Text>
            <Text style={styles.emptySub}>Try a different date or route</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F0EB' },
  header: { backgroundColor: '#0d3322', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingTop: 54, paddingHorizontal: 20, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  name: { fontSize: 20, fontWeight: '700', color: '#fff' },
  avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  searchCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A18' },
  swapBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F2F0EB', justifyContent: 'center', alignItems: 'center' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dateInput: { flex: 1, backgroundColor: '#F2F0EB', borderRadius: 12, padding: 10, fontSize: 13, color: '#1A1A18' },
  seatsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F0EB', borderRadius: 12, paddingHorizontal: 10 },
  seatBtn: { padding: 6 },
  seatBtnText: { fontSize: 18, fontWeight: '700', color: BRAND },
  seatsText: { fontSize: 13, fontWeight: '500', color: '#1A1A18' },
  searchBtn: { marginTop: 12, backgroundColor: BRAND, borderRadius: 13, padding: 13, alignItems: 'center' },
  searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A18', marginHorizontal: 20, marginTop: 20, marginBottom: 12 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 },
  chipScroll: { paddingLeft: 20, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)', marginRight: 8 },
  chipActive: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontSize: 13, fontWeight: '500', color: '#1A1A18' },
  chipTextActive: { color: '#fff' },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#1A1A18' },
  emptySub: { fontSize: 13, color: '#6B6860', marginTop: 4 },
});
