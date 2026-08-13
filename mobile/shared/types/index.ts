// Fixed test identities (brief §23) — no auth/registration for v1, so each app
// is hardcoded to a single user and skips any login screen entirely.

export type UserRole = 'passenger' | 'driver';

export interface FixedUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface FixedDriverUser extends FixedUser {
  role: 'driver';
  vehicleName: string;
  verified: boolean;
  subscriptionStatus: 'active' | 'inactive';
}

export const FIXED_PASSENGER: FixedUser = {
  id: 'passenger_01',
  name: 'Test Passenger',
  role: 'passenger',
};

export const FIXED_DRIVER: FixedDriverUser = {
  id: 'driver_01',
  name: 'Test Driver',
  role: 'driver',
  vehicleName: 'Test Taxi',
  verified: true,
  subscriptionStatus: 'active',
};

// Mirrors backend/src/ride.ts — the backend is the sole authority on ride state,
// these types just describe the shape it broadcasts over `ride:updated`.
export type RideStatus =
  | 'REQUESTED'
  | 'BIDDING'
  | 'NEGOTIATING'
  | 'CONFIRMED'
  | 'DRIVER_ARRIVING'
  | 'DRIVER_ARRIVED'
  | 'RIDE_STARTED'
  | 'RIDE_IN_PROGRESS'
  | 'RIDE_COMPLETED'
  | 'CANCELLED';

export interface RideLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId: string;
  status: RideStatus;
  pickup: RideLocation;
  dropoff: RideLocation;
  // null until the passenger counters — the driver's bid is the opening price.
  passengerOffer: number | null;
  driverOffer: number | null;
  agreedFare: number | null;
  turn: UserRole | null;
  counterOffersUsed: { passenger: number; driver: number };
  cancelReason: string | null;
  createdAt: number;
}

// Matches the backend's default (NEGOTIATION_CAP env var) — only gates the UI;
// the backend enforces the real limit server-side regardless of what the client sends.
export const COUNTER_OFFER_CAP = 1;

// Statuses where either side may still cancel, per brief branch 2 ("any time before RIDE_STARTED").
export const CANCELLABLE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'BIDDING',
  'NEGOTIATING',
  'CONFIRMED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
];
