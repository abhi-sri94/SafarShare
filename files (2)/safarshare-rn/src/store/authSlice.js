import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, usersAPI } from '../services/api';

// ── Async thunks ──────────────────────────────────────────────────────────
export const loginThunk = createAsyncThunk('auth/login', async ({ phone, password }, { rejectWithValue }) => {
  try {
    const data = await authAPI.login(phone, password);
    await AsyncStorage.multiSet([
      ['ss_token', data.token],
      ['ss_refresh', data.refreshToken],
      ['ss_user', JSON.stringify(data.data.user)],
    ]);
    return data.data.user;
  } catch (e) { return rejectWithValue(e.message); }
});

export const loginOTPThunk = createAsyncThunk('auth/loginOTP', async ({ phone, otp }, { rejectWithValue }) => {
  try {
    const data = await authAPI.loginOTP(phone, otp);
    await AsyncStorage.multiSet([
      ['ss_token', data.token],
      ['ss_refresh', data.refreshToken],
      ['ss_user', JSON.stringify(data.data.user)],
    ]);
    return data.data.user;
  } catch (e) { return rejectWithValue(e.message); }
});

export const registerThunk = createAsyncThunk('auth/register', async (formData, { rejectWithValue }) => {
  try {
    const data = await authAPI.register(formData);
    await AsyncStorage.multiSet([
      ['ss_token', data.token],
      ['ss_refresh', data.refreshToken],
      ['ss_user', JSON.stringify(data.data.user)],
    ]);
    return data.data.user;
  } catch (e) { return rejectWithValue(e.message); }
});

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  try { await authAPI.logout(); } catch (e) {}
  await AsyncStorage.multiRemove(['ss_token', 'ss_refresh', 'ss_user']);
});

export const loadStoredAuthThunk = createAsyncThunk('auth/loadStored', async () => {
  const [[, token], [, user]] = await AsyncStorage.multiGet(['ss_token', 'ss_user']);
  if (token && user) return JSON.parse(user);
  return null;
});

export const switchRoleThunk = createAsyncThunk('auth/switchRole', async (role, { rejectWithValue }) => {
  try {
    await usersAPI.switchRole(role);
    return role;
  } catch (e) { return rejectWithValue(e.message); }
});

// ── Slice ─────────────────────────────────────────────────────────────────
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isLoggedIn: false,
    isLoading: false,
    isBootstrapping: true,
    error: null,
    activeRole: 'passenger',
  },
  reducers: {
    clearError: (state) => { state.error = null; },
    updateUser: (state, action) => { state.user = { ...state.user, ...action.payload }; },
  },
  extraReducers: (builder) => {
    const setLoading = (state) => { state.isLoading = true; state.error = null; };
    const setError = (state, action) => { state.isLoading = false; state.error = action.payload; };
    const setUser = (state, action) => {
      state.isLoading = false;
      state.user = action.payload;
      state.isLoggedIn = !!action.payload;
      state.activeRole = action.payload?.activeRole || action.payload?.role || 'passenger';
      state.isBootstrapping = false;
    };

    builder
      .addCase(loginThunk.pending, setLoading)
      .addCase(loginThunk.fulfilled, setUser)
      .addCase(loginThunk.rejected, setError)
      .addCase(loginOTPThunk.pending, setLoading)
      .addCase(loginOTPThunk.fulfilled, setUser)
      .addCase(loginOTPThunk.rejected, setError)
      .addCase(registerThunk.pending, setLoading)
      .addCase(registerThunk.fulfilled, setUser)
      .addCase(registerThunk.rejected, setError)
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user = null; state.isLoggedIn = false;
        state.activeRole = 'passenger'; state.isBootstrapping = false;
      })
      .addCase(loadStoredAuthThunk.fulfilled, setUser)
      .addCase(loadStoredAuthThunk.rejected, (state) => { state.isBootstrapping = false; })
      .addCase(switchRoleThunk.fulfilled, (state, action) => {
        state.activeRole = action.payload;
        if (state.user) state.user.activeRole = action.payload;
      });
  },
});

export const { clearError, updateUser } = authSlice.actions;
export default authSlice.reducer;
