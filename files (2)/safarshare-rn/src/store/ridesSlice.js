import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ridesAPI, bookingsAPI } from '../services/api';

export const searchRidesThunk = createAsyncThunk('rides/search', async (params, { rejectWithValue }) => {
  try {
    const data = await ridesAPI.search(params);
    return data.data.rides;
  } catch (e) { return rejectWithValue(e.message); }
});

export const fetchRideThunk = createAsyncThunk('rides/fetchOne', async (id, { rejectWithValue }) => {
  try {
    const data = await ridesAPI.getById(id);
    return data.data.ride;
  } catch (e) { return rejectWithValue(e.message); }
});

export const fetchMyRidesThunk = createAsyncThunk('rides/myRides', async (params, { rejectWithValue }) => {
  try {
    const data = await ridesAPI.myRides(params);
    return data.data.rides;
  } catch (e) { return rejectWithValue(e.message); }
});

export const createRideThunk = createAsyncThunk('rides/create', async (rideData, { rejectWithValue }) => {
  try {
    const data = await ridesAPI.create(rideData);
    return data.data.ride;
  } catch (e) { return rejectWithValue(e.message); }
});

export const fetchMyBookingsThunk = createAsyncThunk('rides/myBookings', async (params, { rejectWithValue }) => {
  try {
    const data = await bookingsAPI.myList(params);
    return data.data.bookings;
  } catch (e) { return rejectWithValue(e.message); }
});

const ridesSlice = createSlice({
  name: 'rides',
  initialState: {
    searchResults: [],
    selectedRide: null,
    myRides: [],
    myBookings: [],
    isSearching: false,
    isLoading: false,
    error: null,
  },
  reducers: {
    setSelectedRide: (state, action) => { state.selectedRide = action.payload; },
    clearSearch: (state) => { state.searchResults = []; },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchRidesThunk.pending, (s) => { s.isSearching = true; s.error = null; })
      .addCase(searchRidesThunk.fulfilled, (s, a) => { s.isSearching = false; s.searchResults = a.payload; })
      .addCase(searchRidesThunk.rejected, (s, a) => { s.isSearching = false; s.error = a.payload; })
      .addCase(fetchRideThunk.fulfilled, (s, a) => { s.selectedRide = a.payload; })
      .addCase(fetchMyRidesThunk.pending, (s) => { s.isLoading = true; })
      .addCase(fetchMyRidesThunk.fulfilled, (s, a) => { s.isLoading = false; s.myRides = a.payload; })
      .addCase(createRideThunk.fulfilled, (s, a) => { s.myRides = [a.payload, ...s.myRides]; })
      .addCase(fetchMyBookingsThunk.fulfilled, (s, a) => { s.myBookings = a.payload; });
  },
});

export const { setSelectedRide, clearSearch, clearError } = ridesSlice.actions;
export default ridesSlice.reducer;
