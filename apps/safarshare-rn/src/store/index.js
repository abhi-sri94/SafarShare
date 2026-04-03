import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import ridesReducer from './ridesSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    rides: ridesReducer,
  },
  middleware: (getDefault) => getDefault({ serializableCheck: false }),
});

export const RootState = store.getState;
export const AppDispatch = store.dispatch;
