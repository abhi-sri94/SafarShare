import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector } from 'react-redux';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

// ── Screens ───────────────────────────────────────────────────────────────
import SplashScreen     from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen      from '../screens/LoginScreen';
import RegisterScreen   from '../screens/RegisterScreen';
import OTPScreen        from '../screens/OTPScreen';
import HomeScreen       from '../screens/HomeScreen';
import SearchResultsScreen from '../screens/SearchResultsScreen';
import RideDetailScreen from '../screens/RideDetailScreen';
import BookingScreen    from '../screens/BookingScreen';
import BookingSuccessScreen from '../screens/BookingSuccessScreen';
import TrackingScreen   from '../screens/TrackingScreen';
import PanicScreen      from '../screens/PanicScreen';
import ChatScreen       from '../screens/ChatScreen';
import MyRidesScreen    from '../screens/MyRidesScreen';
import BookingDetailScreen from '../screens/BookingDetailScreen';
import ProfileScreen    from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import EmergencyContactsScreen from '../screens/EmergencyContactsScreen';
import DriverHomeScreen from '../screens/DriverHomeScreen';
import PostRideScreen   from '../screens/PostRideScreen';
import DriverEarningsScreen from '../screens/DriverEarningsScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const BRAND = '#0F5C3A';
const MUTED = '#9B9890';

// ── Passenger tab navigator ───────────────────────────────────────────────
function PassengerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: { height: 60, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: ({color}) => <TabIcon name="home" color={color} /> }} />
      <Tab.Screen name="MyRides" component={MyRidesScreen}
        options={{ title: 'My Rides', tabBarIcon: ({color}) => <TabIcon name="car" color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({color}) => <TabIcon name="person" color={color} /> }} />
    </Tab.Navigator>
  );
}

// ── Driver tab navigator ──────────────────────────────────────────────────
function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: { height: 60, paddingBottom: 8 },
      }}>
      <Tab.Screen name="DriverHome" component={DriverHomeScreen}
        options={{ title: 'Home', tabBarIcon: ({color}) => <TabIcon name="home" color={color} /> }} />
      <Tab.Screen name="PostRide" component={PostRideScreen}
        options={{ title: 'Post Ride', tabBarIcon: ({color}) => <TabIcon name="add-circle" color={color} /> }} />
      <Tab.Screen name="Earnings" component={DriverEarningsScreen}
        options={{ tabBarIcon: ({color}) => <TabIcon name="wallet" color={color} /> }} />
      <Tab.Screen name="DriverProfile" component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({color}) => <TabIcon name="person" color={color} /> }} />
    </Tab.Navigator>
  );
}

// ── Simple SVG tab icon ───────────────────────────────────────────────────
function TabIcon({ name, color }) {
  const icons = {
    home: '⌂', car: '🚗', person: '👤',
    'add-circle': '＋', wallet: '💰',
  };
  return <Text style={{ fontSize: 20, color }}>{icons[name] || '●'}</Text>;
}

// ── Root navigator ────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { isLoggedIn, isBootstrapping, activeRole } = useSelector(s => s.auth);

  if (isBootstrapping) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!isLoggedIn ? (
          // ── Auth stack ─────────────────────────────────────────────────
          <>
            <Stack.Screen name="Splash"      component={SplashScreen} />
            <Stack.Screen name="Onboarding"  component={OnboardingScreen} />
            <Stack.Screen name="Login"       component={LoginScreen} />
            <Stack.Screen name="Register"    component={RegisterScreen} />
            <Stack.Screen name="OTP"         component={OTPScreen} />
          </>
        ) : (
          // ── Authenticated stack ────────────────────────────────────────
          <>
            <Stack.Screen name="Main"
              component={activeRole === 'driver' ? DriverTabs : PassengerTabs} />
            <Stack.Screen name="SearchResults"   component={SearchResultsScreen} />
            <Stack.Screen name="RideDetail"      component={RideDetailScreen} />
            <Stack.Screen name="Booking"         component={BookingScreen} />
            <Stack.Screen name="BookingSuccess"  component={BookingSuccessScreen} />
            <Stack.Screen name="BookingDetail"   component={BookingDetailScreen} />
            <Stack.Screen name="Tracking"        component={TrackingScreen} />
            <Stack.Screen name="Panic"           component={PanicScreen} />
            <Stack.Screen name="Chat"            component={ChatScreen} />
            <Stack.Screen name="EditProfile"     component={EditProfileScreen} />
            <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
            <Stack.Screen name="DriverEarnings"  component={DriverEarningsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d3322' },
});
