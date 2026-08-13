import { StyleSheet, Text, View } from 'react-native';
import type { RideStatus } from '@beep/shared/dist/types';

const STATUS_LABELS: Record<RideStatus, string> = {
  REQUESTED: 'Requesting…',
  BIDDING: 'Waiting for a bid',
  NEGOTIATING: 'Negotiating',
  CONFIRMED: 'Confirmed',
  DRIVER_ARRIVING: 'Driver en route',
  DRIVER_ARRIVED: 'Driver arrived',
  RIDE_STARTED: 'Ride started',
  RIDE_IN_PROGRESS: 'In progress',
  RIDE_COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<RideStatus, { bg: string; text: string }> = {
  REQUESTED: { bg: '#FEF3C7', text: '#92400E' },
  BIDDING: { bg: '#FEF3C7', text: '#92400E' },
  NEGOTIATING: { bg: '#DBEAFE', text: '#1E40AF' },
  CONFIRMED: { bg: '#DCFCE7', text: '#166534' },
  DRIVER_ARRIVING: { bg: '#DCFCE7', text: '#166534' },
  DRIVER_ARRIVED: { bg: '#DCFCE7', text: '#166534' },
  RIDE_STARTED: { bg: '#DCFCE7', text: '#166534' },
  RIDE_IN_PROGRESS: { bg: '#DCFCE7', text: '#166534' },
  RIDE_COMPLETED: { bg: '#CFFAFE', text: '#155E75' },
  CANCELLED: { bg: '#FEE2E2', text: '#991B1B' },
};

export function StatusBadge({ status }: { status: RideStatus }) {
  const { bg, text } = STATUS_COLORS[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
