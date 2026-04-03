import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use deployed backend over HTTPS to avoid mixed-content / network issues.
export const BASE_URL = 'https://safarshare.onrender.com/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT ──────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('ss_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: auto refresh token ─────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = await AsyncStorage.getItem('ss_refresh');
        if (refresh) {
          const res = await axios.post(`${BASE_URL}/auth/refresh-token`, { refreshToken: refresh });
          const newToken = res.data.token;
          await AsyncStorage.setItem('ss_token', newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch (e) {
        await AsyncStorage.multiRemove(['ss_token', 'ss_refresh', 'ss_user']);
        // Navigate to login — handled by auth store
      }
    }
    const message = error.response?.data?.errors?.[0]?.msg
      || error.response?.data?.message
      || error.message
      || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;

// ── Auth endpoints ────────────────────────────────────────────────────────
export const authAPI = {
  loginFirebase:    (firebaseToken, fcmToken) => api.post('/auth/login-firebase', { firebaseToken, fcmToken }),
  registerFirebase: (data) => api.post('/auth/register-firebase', data),
  refreshToken:     (token) => api.post('/auth/refresh-token', { refreshToken: token }),
  me:               () => api.get('/auth/me'),
  logout:           () => api.post('/auth/logout'),
};

// ── Ride endpoints ────────────────────────────────────────────────────────
export const ridesAPI = {
  search:      (params) => api.get('/rides/search', { params }),
  getById:     (id)     => api.get(`/rides/${id}`),
  create:      (data)   => api.post('/rides', data),
  myRides:     (params) => api.get('/rides/driver/my-rides', { params }),
  start:       (id)     => api.patch(`/rides/${id}/start`),
  complete:    (id)     => api.patch(`/rides/${id}/complete`),
  cancel:      (id, reason) => api.patch(`/rides/${id}/cancel`, { reason }),
  updateLocation:(id, lat, lng) => api.patch(`/rides/${id}/location`, { lat, lng }),
  nearbyDrivers:(lat, lng) => api.get('/rides/nearby/drivers', { params: { lat, lng } }),
  autocomplete: (input) => api.get('/maps/autocomplete', { params: { input } }),
};

// ── Booking endpoints ─────────────────────────────────────────────────────
export const bookingsAPI = {
  create:  (data)     => api.post('/bookings', data),
  myList:  (params)   => api.get('/bookings/my', { params }),
  getById: (id)       => api.get(`/bookings/${id}`),
  cancel:  (id, reason) => api.post(`/bookings/${id}/cancel`, { reason }),
  rate:    (id, data) => api.post(`/bookings/${id}/rate`, data),
  panic:   (id, lat, lng) => api.post(`/bookings/${id}/panic`, { lat, lng }),
};

// ── Payment endpoints ─────────────────────────────────────────────────────
export const paymentsAPI = {
  verify:   (data)    => api.post('/payments/verify', data),
  myList:   (params)  => api.get('/payments/my', { params }),
  earnings: (period)  => api.get('/payments/earnings', { params: { period } }),
  receipt:  (id)      => api.get(`/payments/${id}/receipt`),
};

// ── Chat endpoints ────────────────────────────────────────────────────────
export const chatAPI = {
  messages:      (bookingId, params) => api.get(`/chat/${bookingId}/messages`, { params }),
  conversations: ()                  => api.get('/chat/conversations/list'),
  unreadCount:   ()                  => api.get('/chat/unread/count'),
};

// ── Tracking endpoint ─────────────────────────────────────────────────────
export const trackingAPI = {
  get: (rideId) => api.get(`/tracking/${rideId}`),
};

// ── User endpoints ────────────────────────────────────────────────────────
export const usersAPI = {
  getById:           (id)    => api.get(`/users/${id}`),
  updateProfile:     (data)  => api.patch('/users/profile/update', data),
  uploadDocument:    (form)  => api.post('/users/upload-document', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
  emergencyContacts: (contacts) => api.patch('/users/emergency-contacts', { contacts }),
  driverInfo:        (data)  => api.patch('/users/driver-info', data),
  changePassword:    (data)  => api.patch('/users/change-password', data),
  switchRole:        (role)  => api.patch('/users/switch-role', { role }),
  stats:             ()      => api.get('/users/stats/me'),
  updateFCM:         (token) => api.patch('/notifications/fcm-token', { fcmToken: token }),
};
