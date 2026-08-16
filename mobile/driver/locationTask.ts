import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { Socket } from '@beep/shared/dist/socket';

export const LOCATION_TASK_NAME = 'beep-driver-location-task';

// The task runs outside the React tree (it's registered at module scope, per
// TaskManager's requirement that defineTask execute unconditionally at bundle
// load), so it can't close over component state — this module-level socket
// reference is how App.tsx hands it a live socket to emit through.
let activeSocket: Socket | null = null;

export function setLocationSocket(socket: Socket | null): void {
  activeSocket = socket;
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[locationTask]', error);
    return;
  }
  try {
    const { locations } = data as { locations: Location.LocationObject[] };
    const last = locations?.[locations.length - 1];
    if (!last || !activeSocket) return;

    // volatile: dropped if the socket is currently disconnected rather than
    // queued for replay on reconnect — a burst of stale queued pings would jerk
    // the passenger's marker backward through history instead of just resuming
    // from the current position.
    activeSocket.volatile.emit('ride:driverLocationUpdate', {
      lat: last.coords.latitude,
      lng: last.coords.longitude,
    });
  } catch (e) {
    console.warn('[locationTask] emit failed', e);
  }
});

interface TrackingResult {
  ok: boolean;
  reason?: string;
}

export async function startDriverLocationTracking(): Promise<TrackingResult> {
  // Background location on iOS needs its own plist/entitlement config that this
  // project has never set up or built against (Android-only project so far, per
  // README/builds) — no-op cleanly rather than ship unverified iOS behavior.
  if (Platform.OS !== 'android') {
    return { ok: false, reason: 'Background location sharing is only supported on Android in this build.' };
  }

  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    return { ok: true };
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { ok: false, reason: 'Location permission denied — enable it to share your position with passengers.' };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    return {
      ok: false,
      reason: 'Background location access is required to share your position while the app is minimized.',
    };
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 4000,
      distanceInterval: 15,
      foregroundService: {
        notificationTitle: 'Beep — Location sharing active',
        notificationBody: 'Your location is being shared with your passenger while this ride is active.',
        killServiceOnDestroy: true,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not start location sharing.' };
  }
}

export async function stopDriverLocationTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
