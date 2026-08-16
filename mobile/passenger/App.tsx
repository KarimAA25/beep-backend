import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createSocket, type Socket } from '@beep/shared/dist/socket';
import {
  FIXED_PASSENGER,
  COUNTER_OFFER_CAP,
  CANCELLABLE_STATUSES,
  type DriverLocation,
  type Ride,
  type RideLocation,
} from '@beep/shared/dist/types';
import { AppButton } from './components/AppButton';
import { StatusBadge } from './components/StatusBadge';
import { RideMap } from './components/RideMap';
import { DriverTrackingMap } from './components/DriverTrackingMap';
import { StarRating } from './components/StarRating';

// Dev builds hit the local backend over LAN (a physical device can't use
// localhost/10.0.2.2 — those only resolve from an Android emulator; re-check with
// `ipconfig` if this stops working after switching networks). Production builds hit
// Render. NOTE: the backend isn't deployed yet — this is the URL it'll get from
// render.yaml's `name: beep-backend` on first deploy; confirm it in the Render
// dashboard and update here if the slug came out different.
const BACKEND_URL = __DEV__ ? 'http://192.168.18.178:3000' : 'https://beep-backend.onrender.com';

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection error',
};

const CONNECTION_COLORS: Record<ConnectionStatus, string> = {
  connecting: '#F59E0B',
  connected: '#16A34A',
  reconnecting: '#F59E0B',
  error: '#DC2626',
};

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [showConnectionHint, setShowConnectionHint] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterFare, setCounterFare] = useState('');
  const [pickup, setPickup] = useState<RideLocation | null>(null);
  const [dropoff, setDropoff] = useState<RideLocation | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [rating, setRating] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    const socket: Socket = createSocket(BACKEND_URL, {
      userId: FIXED_PASSENGER.id,
      role: FIXED_PASSENGER.role,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      hasConnectedOnce.current = true;
      setConnectionStatus('connected');
    });
    // A server-initiated disconnect (e.g. identity_rejected) won't auto-reconnect —
    // showing "reconnecting" there would be misleading, so treat it as an error.
    socket.on('disconnect', (reason) => {
      setConnectionStatus(reason === 'io server disconnect' ? 'error' : 'reconnecting');
    });
    socket.on('connect_error', () => setConnectionStatus('error'));
    socket.on('identity_rejected', (payload: { reason: string }) =>
      setNotice(`Connection rejected: ${payload.reason}`)
    );
    socket.io.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));
    socket.io.on('reconnect', () => setConnectionStatus('connected'));
    socket.on('ride:updated', (r: Ride | null) => {
      setRide(r);
      // Last known position rides along on the ride object, so a reconnecting
      // passenger sees it immediately instead of waiting for the next GPS tick.
      setDriverLocation(r?.driverLocation ?? null);
    });
    socket.on('ride:driverLocation', (loc: DriverLocation) => setDriverLocation(loc));
    socket.on('ride:noDriverAvailable', (payload: { message: string }) => setNotice(payload.message));
    socket.on('ride:actionError', (payload: { message: string }) => setNotice(payload.message));

    return () => {
      socket.disconnect();
    };
  }, []);

  // Basic timeout UI (Phase 9): if we're not connected within a few seconds, surface
  // a hint — most likely a Render free-tier cold start (see README) rather than a
  // real failure, so word it as "still trying" rather than an outright error.
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setShowConnectionHint(false);
      return;
    }
    const timer = setTimeout(() => setShowConnectionHint(true), 8000);
    return () => clearTimeout(timer);
  }, [connectionStatus]);

  const requestRide = () => {
    if (!pickup || !dropoff) return;
    setNotice(null);
    socketRef.current?.emit('ride:request', { pickup, dropoff });
  };

  const resetLocations = () => {
    setPickup(null);
    setDropoff(null);
  };

  const acceptOffer = () => socketRef.current?.emit('ride:accept');
  const rejectOffer = () => socketRef.current?.emit('ride:reject');

  const sendCounterOffer = () => {
    const fare = Number(counterFare);
    if (!fare || fare <= 0) {
      setNotice('Enter a valid counter offer.');
      return;
    }
    socketRef.current?.emit('ride:counterOffer', { fare });
    setCounterFare('');
  };

  const cancelRide = () => socketRef.current?.emit('ride:cancel');
  const dismiss = () => {
    setRide(null);
    setDriverLocation(null);
    setRating(0);
    resetLocations();
  };

  const usedOwnCounter = (ride?.counterOffersUsed.passenger ?? 0) >= COUNTER_OFFER_CAP;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.appName}>beep</Text>
        <Text style={styles.roleTag}>Passenger</Text>
        <View style={styles.connectionRow}>
          <View style={[styles.dot, { backgroundColor: CONNECTION_COLORS[connectionStatus] }]} />
          <Text style={styles.connectionLabel}>{CONNECTION_LABELS[connectionStatus]}</Text>
        </View>
        <Text style={styles.identity}>Signed in as {FIXED_PASSENGER.name}</Text>
      </View>

      {connectionStatus !== 'connected' && showConnectionHint && (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>
            {hasConnectedOnce.current
              ? 'Having trouble reconnecting to the server.'
              : 'Still trying to reach the server — it may be waking up (this can take up to a minute).'}
          </Text>
          <View style={styles.noticeButtonSpacing}>
            <AppButton title="Retry Now" variant="secondary" onPress={() => socketRef.current?.connect()} />
          </View>
        </View>
      )}

      {notice && (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      {!ride && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Where to?</Text>
          <RideMap pickup={pickup} dropoff={dropoff} onSetPickup={setPickup} onSetDropoff={setDropoff} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#16A34A' }]} />
            <Text style={styles.routeLabel}>
              {pickup ? `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}` : 'Tap the map to set pickup'}
            </Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#DC2626' }]} />
            <Text style={styles.routeLabel}>
              {dropoff
                ? `${dropoff.lat.toFixed(5)}, ${dropoff.lng.toFixed(5)}`
                : pickup
                  ? 'Tap the map to set dropoff'
                  : 'Set pickup first'}
            </Text>
          </View>
          <AppButton title="Request Ride" onPress={requestRide} disabled={!pickup || !dropoff} />
          {(pickup || dropoff) && (
            <AppButton title="Reset locations" variant="secondary" onPress={resetLocations} />
          )}
        </View>
      )}

      {ride && (ride.status === 'REQUESTED' || ride.status === 'BIDDING') && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Looking for a driver…</Text>
          <AppButton title="Cancel" variant="danger" onPress={cancelRide} />
        </View>
      )}

      {ride && ride.status === 'NEGOTIATING' && ride.turn === 'passenger' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Driver's offer</Text>
          <Text style={styles.fare}>${ride.driverOffer}</Text>
          <AppButton title={`Accept $${ride.driverOffer}`} variant="success" onPress={acceptOffer} />
          {!usedOwnCounter && (
            <>
              <Text style={styles.label}>Counter offer ($)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={counterFare}
                onChangeText={setCounterFare}
                placeholder="Enter amount"
              />
              <AppButton title="Send Counter Offer" onPress={sendCounterOffer} />
            </>
          )}
          <AppButton title="Reject" variant="danger" onPress={rejectOffer} />
        </View>
      )}

      {ride && ride.status === 'NEGOTIATING' && ride.turn === 'driver' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Waiting for driver's response…</Text>
          <Text style={styles.fare}>${ride.passengerOffer}</Text>
        </View>
      )}

      {ride && (ride.status === 'CONFIRMED' || ride.status === 'DRIVER_ARRIVING') && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Driver is on the way</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          <DriverTrackingMap pickup={ride.pickup} dropoff={ride.dropoff} driverLocation={driverLocation} />
          {CANCELLABLE_STATUSES.includes(ride.status) && (
            <AppButton title="Cancel" variant="danger" onPress={cancelRide} />
          )}
        </View>
      )}

      {ride && ride.status === 'DRIVER_ARRIVED' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Your driver has arrived</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          <DriverTrackingMap pickup={ride.pickup} dropoff={ride.dropoff} driverLocation={driverLocation} />
          {CANCELLABLE_STATUSES.includes(ride.status) && (
            <AppButton title="Cancel" variant="danger" onPress={cancelRide} />
          )}
        </View>
      )}

      {ride && (ride.status === 'RIDE_STARTED' || ride.status === 'RIDE_IN_PROGRESS') && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Ride in progress</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          <DriverTrackingMap pickup={ride.pickup} dropoff={ride.dropoff} driverLocation={driverLocation} />
        </View>
      )}

      {ride && ride.status === 'RIDE_COMPLETED' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Ride completed!</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          <Text style={styles.label}>Rate your driver</Text>
          <StarRating value={rating} onChange={setRating} />
          {rating > 0 && <Text style={styles.cardBody}>Thanks for your feedback!</Text>}
          <AppButton title="Back to start" variant="secondary" onPress={dismiss} />
        </View>
      )}

      {ride && ride.status === 'CANCELLED' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>{ride.cancelReason}</Text>
          <AppButton title="Back to start" variant="secondary" onPress={dismiss} />
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    marginTop: 24,
    marginBottom: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  roleTag: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionLabel: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  identity: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  noticeBanner: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
  },
  noticeText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  noticeButtonSpacing: {
    marginTop: 8,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: 10,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardBody: {
    fontSize: 15,
    color: '#334155',
  },
  fare: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
  },
  hint: {
    fontSize: 12,
    color: '#94A3B8',
  },
  label: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F8FAFC',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLabel: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: '#CBD5E1',
    marginLeft: 4,
  },
});
