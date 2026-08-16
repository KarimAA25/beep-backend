import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createSocket, type Socket } from '@beep/shared/dist/socket';
import {
  FIXED_DRIVER,
  COUNTER_OFFER_CAP,
  CANCELLABLE_STATUSES,
  type Ride,
} from '@beep/shared/dist/types';
import { AppButton } from './components/AppButton';
import { StatusBadge } from './components/StatusBadge';
import { DriverMap } from './components/DriverMap';
import {
  setLocationSocket,
  startDriverLocationTracking,
  stopDriverLocationTracking,
} from './locationTask';

// Dev builds hit the local backend over LAN (a physical device can't use
// localhost/10.0.2.2 — those only resolve from an Android emulator; re-check with
// `ipconfig` if this stops working after switching networks). Production builds hit
// Render. NOTE: the backend isn't deployed yet — this is the URL it'll get from
// render.yaml's `name: beep-backend` on first deploy; confirm it in the Render
// dashboard and update here if the slug came out different.
const BACKEND_URL = __DEV__ ? 'http://192.168.18.178:3000' : 'https://beep-backend.onrender.com';

const IN_FLIGHT_STATUSES: Ride['status'][] = [
  'CONFIRMED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'RIDE_STARTED',
  'RIDE_IN_PROGRESS',
];

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
  const [locationSharingBlocked, setLocationSharingBlocked] = useState(false);
  const [bidFare, setBidFare] = useState('10');
  const [counterFare, setCounterFare] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    const socket: Socket = createSocket(BACKEND_URL, {
      userId: FIXED_DRIVER.id,
      role: FIXED_DRIVER.role,
    });
    socketRef.current = socket;
    setLocationSocket(socket);

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
    socket.on('ride:updated', (r: Ride | null) => setRide(r));
    socket.on('ride:noDriverAvailable', (payload: { message: string }) => setNotice(payload.message));
    socket.on('ride:actionError', (payload: { message: string }) => setNotice(payload.message));

    return () => {
      setLocationSocket(null);
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

  // Streams the driver's position while a ride is in flight (Phase 6); the target
  // OS tracking call is idempotent, so re-firing across DRIVER_ARRIVING/ARRIVED/etc.
  // doesn't restart the underlying foreground service each time.
  useEffect(() => {
    if (ride && IN_FLIGHT_STATUSES.includes(ride.status)) {
      startDriverLocationTracking().then((result) => {
        setLocationSharingBlocked(!result.ok);
        if (!result.ok) setNotice(result.reason ?? 'Could not start location sharing.');
      });
    } else {
      setLocationSharingBlocked(false);
      stopDriverLocationTracking();
    }
  }, [ride?.status]);

  const sendBid = () => {
    const fare = Number(bidFare);
    if (!fare || fare <= 0) {
      setNotice('Enter a valid bid.');
      return;
    }
    setNotice(null);
    socketRef.current?.emit('ride:bid', { fare });
  };

  const decline = () => socketRef.current?.emit('ride:decline');
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
  const markArrived = () => socketRef.current?.emit('ride:arrived');
  const startRide = () => socketRef.current?.emit('ride:start');
  const completeRide = () => socketRef.current?.emit('ride:complete');
  const dismiss = () => setRide(null);

  const usedOwnCounter = (ride?.counterOffersUsed.driver ?? 0) >= COUNTER_OFFER_CAP;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.appName}>beep</Text>
        <Text style={styles.roleTag}>Driver</Text>
        <View style={styles.connectionRow}>
          <View style={[styles.dot, { backgroundColor: CONNECTION_COLORS[connectionStatus] }]} />
          <Text style={styles.connectionLabel}>{CONNECTION_LABELS[connectionStatus]}</Text>
        </View>
        <Text style={styles.identity}>
          Signed in as {FIXED_DRIVER.name} · {FIXED_DRIVER.vehicleName}
        </Text>
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
          <Text style={styles.cardTitle}>No active requests</Text>
          <DriverMap />
          <Text style={styles.cardBody}>Waiting for a ride request…</Text>
        </View>
      )}

      {ride && (ride.status === 'REQUESTED' || ride.status === 'BIDDING') && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#16A34A' }]} />
            <Text style={styles.routeLabel}>
              {ride.pickup.label ?? `${ride.pickup.lat.toFixed(5)}, ${ride.pickup.lng.toFixed(5)}`}
            </Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#DC2626' }]} />
            <Text style={styles.routeLabel}>
              {ride.dropoff.label ?? `${ride.dropoff.lat.toFixed(5)}, ${ride.dropoff.lng.toFixed(5)}`}
            </Text>
          </View>
          <Text style={styles.label}>Your bid ($)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={bidFare}
            onChangeText={setBidFare}
          />
          <AppButton title="Send Bid" onPress={sendBid} />
          <AppButton title="Decline" variant="danger" onPress={decline} />
        </View>
      )}

      {ride && ride.status === 'NEGOTIATING' && ride.turn === 'driver' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Passenger's offer</Text>
          <Text style={styles.fare}>${ride.passengerOffer}</Text>
          <AppButton title={`Accept $${ride.passengerOffer}`} variant="success" onPress={acceptOffer} />
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

      {ride && ride.status === 'NEGOTIATING' && ride.turn === 'passenger' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Waiting for passenger's response…</Text>
          <Text style={styles.fare}>${ride.driverOffer}</Text>
        </View>
      )}

      {ride && (ride.status === 'CONFIRMED' || ride.status === 'DRIVER_ARRIVING') && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Heading to pickup</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          {locationSharingBlocked && (
            <AppButton title="Open Location Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
          <AppButton
            title="I've Arrived"
            variant="success"
            disabled={ride.status !== 'DRIVER_ARRIVING'}
            onPress={markArrived}
          />
          {CANCELLABLE_STATUSES.includes(ride.status) && (
            <AppButton title="Cancel" variant="danger" onPress={cancelRide} />
          )}
        </View>
      )}

      {ride && ride.status === 'DRIVER_ARRIVED' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>You've arrived at pickup</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          {locationSharingBlocked && (
            <AppButton title="Open Location Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
          <AppButton title="Start Ride" variant="success" onPress={startRide} />
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
          {locationSharingBlocked && (
            <AppButton title="Open Location Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          )}
          <AppButton
            title="Complete Ride"
            variant="success"
            disabled={ride.status !== 'RIDE_IN_PROGRESS'}
            onPress={completeRide}
          />
        </View>
      )}

      {ride && ride.status === 'RIDE_COMPLETED' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Ride completed!</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
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
