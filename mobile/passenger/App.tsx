import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createSocket, type Socket } from '@beep/shared/dist/socket';
import {
  FIXED_PASSENGER,
  COUNTER_OFFER_CAP,
  CANCELLABLE_STATUSES,
  type Ride,
  type RideLocation,
} from '@beep/shared/dist/types';
import { AppButton } from './components/AppButton';
import { StatusBadge } from './components/StatusBadge';

// Points at the local backend from backend/.env (PORT=3000).
// A physical device must use the host machine's LAN IP (not localhost/10.0.2.2 —
// those only resolve from an Android emulator). Re-check with `ipconfig` if this
// stops working after switching networks.
const BACKEND_URL = 'http://10.23.249.224:3000';

// Mocked locations — real pickup/dropoff selection via MapLibre/OSM lands in Phase 5.
const MOCK_PICKUP: RideLocation = { lat: 33.8938, lng: 35.5018, label: 'Hamra' };
const MOCK_DROPOFF: RideLocation = { lat: 33.8869, lng: 35.5131, label: 'Achrafieh' };

const IN_FLIGHT_STATUSES: Ride['status'][] = [
  'CONFIRMED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
  'RIDE_STARTED',
  'RIDE_IN_PROGRESS',
];

export default function App() {
  const [connected, setConnected] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterFare, setCounterFare] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket: Socket = createSocket(BACKEND_URL, {
      userId: FIXED_PASSENGER.id,
      role: FIXED_PASSENGER.role,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('ride:updated', (r: Ride | null) => setRide(r));
    socket.on('ride:noDriverAvailable', (payload: { message: string }) => setNotice(payload.message));
    socket.on('ride:actionError', (payload: { message: string }) => setNotice(payload.message));

    return () => {
      socket.disconnect();
    };
  }, []);

  const requestRide = () => {
    setNotice(null);
    socketRef.current?.emit('ride:request', { pickup: MOCK_PICKUP, dropoff: MOCK_DROPOFF });
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
  const dismiss = () => setRide(null);

  const usedOwnCounter = (ride?.counterOffersUsed.passenger ?? 0) >= COUNTER_OFFER_CAP;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.appName}>Beep</Text>
        <Text style={styles.roleTag}>Passenger</Text>
        <View style={styles.connectionRow}>
          <View style={[styles.dot, { backgroundColor: connected ? '#16A34A' : '#DC2626' }]} />
          <Text style={styles.connectionLabel}>{connected ? 'Connected' : 'Disconnected'}</Text>
        </View>
        <Text style={styles.identity}>Signed in as {FIXED_PASSENGER.name}</Text>
      </View>

      {notice && (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      {!ride && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Where to?</Text>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#16A34A' }]} />
            <Text style={styles.routeLabel}>{MOCK_PICKUP.label}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#DC2626' }]} />
            <Text style={styles.routeLabel}>{MOCK_DROPOFF.label}</Text>
          </View>
          <Text style={styles.hint}>(Map-based pickup/dropoff selection lands in Phase 5)</Text>
          <AppButton title="Request Ride" onPress={requestRide} />
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

      {ride && IN_FLIGHT_STATUSES.includes(ride.status) && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Ride confirmed</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          <Text style={styles.hint}>(Lifecycle screens land in Phase 7)</Text>
          {CANCELLABLE_STATUSES.includes(ride.status) && (
            <AppButton title="Cancel" variant="danger" onPress={cancelRide} />
          )}
        </View>
      )}

      {ride && ride.status === 'RIDE_COMPLETED' && (
        <View style={styles.card}>
          <StatusBadge status={ride.status} />
          <Text style={styles.cardBody}>Ride completed!</Text>
          <Text style={styles.fare}>${ride.agreedFare}</Text>
          <Text style={styles.hint}>(Ratings screen lands in Phase 8)</Text>
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
