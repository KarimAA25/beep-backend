import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { getSocketId, type UserRole } from "./connections";

export type RideStatus =
  | "REQUESTED"
  | "BIDDING"
  | "NEGOTIATING"
  | "CONFIRMED"
  | "DRIVER_ARRIVING"
  | "DRIVER_ARRIVED"
  | "RIDE_STARTED"
  | "RIDE_IN_PROGRESS"
  | "RIDE_COMPLETED"
  | "CANCELLED";

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
  // null until the passenger counters — the driver's bid is the opening price, the
  // passenger no longer proposes a fare when requesting the ride.
  passengerOffer: number | null;
  driverOffer: number | null;
  agreedFare: number | null;
  // Whose move it is during NEGOTIATING; null outside that state.
  turn: UserRole | null;
  counterOffersUsed: { passenger: number; driver: number };
  cancelReason: string | null;
  createdAt: number;
}

interface Identity {
  userId: string;
  role: UserRole;
}

// Configurable per brief: no-bid / no-response timeout and per-side counter-offer cap.
const NO_BID_TIMEOUT_MS = Number(process.env.NO_BID_TIMEOUT_MS) || 60_000;
const BID_RESPONSE_TIMEOUT_MS = Number(process.env.BID_RESPONSE_TIMEOUT_MS) || 60_000;
const COUNTER_OFFER_CAP = Number(process.env.COUNTER_OFFER_CAP) || 1;

const PASSENGER_ID = "passenger_01";
const DRIVER_ID = "driver_01";

// Cancellable any time before RIDE_STARTED, per brief branch 2.
const CANCELLABLE_STATUSES: RideStatus[] = [
  "REQUESTED",
  "BIDDING",
  "NEGOTIATING",
  "CONFIRMED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
];

export function rideRoomName(rideId: string): string {
  return `ride:${rideId}`;
}

// Single active ride, in-memory only — matches the brief's no-database prototype scope.
let activeRide: Ride | null = null;
let negotiationTimer: NodeJS.Timeout | null = null;

function clearNegotiationTimer(): void {
  if (negotiationTimer) {
    clearTimeout(negotiationTimer);
    negotiationTimer = null;
  }
}

function broadcast(io: Server): void {
  if (!activeRide) return;
  io.to(rideRoomName(activeRide.id)).emit("ride:updated", activeRide);
  console.log(`[ride] ${activeRide.id} -> ${activeRide.status}`);
}

// Branch 3 (counter-offer cap hit) and normal completion — both end the ride and free
// up the single active-ride slot for a new request.
function finishRide(io: Server, status: "CANCELLED" | "RIDE_COMPLETED", reason?: string): void {
  if (!activeRide) return;
  clearNegotiationTimer();
  activeRide.status = status;
  if (status === "CANCELLED") activeRide.cancelReason = reason ?? null;
  const room = rideRoomName(activeRide.id);
  io.to(room).emit("ride:updated", activeRide);
  console.log(`[ride] ${activeRide.id} -> ${status}${reason ? ` (${reason})` : ""}`);
  io.in(room).socketsLeave(room);
  activeRide = null;
}

// Branches 1 & 4: reset straight to null (not a CANCELLED ride record) with a
// dedicated notification, since these represent "the request never became a ride"
// rather than an explicit cancellation of an agreed ride.
function resetNoDriverAvailable(io: Server): void {
  if (!activeRide) return;
  clearNegotiationTimer();
  const room = rideRoomName(activeRide.id);
  console.log(`[ride] ${activeRide.id} -> reset (no driver available)`);
  io.to(room).emit("ride:noDriverAvailable", { message: "No driver available." });
  io.to(room).emit("ride:updated", null);
  io.in(room).socketsLeave(room);
  activeRide = null;
}

function startNoBidTimer(io: Server): void {
  clearNegotiationTimer();
  negotiationTimer = setTimeout(() => resetNoDriverAvailable(io), NO_BID_TIMEOUT_MS);
}

function startBidResponseTimer(io: Server): void {
  clearNegotiationTimer();
  negotiationTimer = setTimeout(() => resetNoDriverAvailable(io), BID_RESPONSE_TIMEOUT_MS);
}

// CONFIRMED implies the driver is now heading to pickup — no separate driver
// action for this per the brief's 3-button lifecycle (arrived/start/complete).
function advanceToDriverArriving(io: Server): void {
  if (!activeRide) return;
  activeRide.status = "DRIVER_ARRIVING";
  broadcast(io);
}

export function registerRideHandlers(io: Server, socket: Socket, identity: Identity): void {
  // Reconnect support (branch 5): rejoin the ride room and push current state immediately.
  if (
    activeRide &&
    (activeRide.passengerId === identity.userId || activeRide.driverId === identity.userId)
  ) {
    socket.join(rideRoomName(activeRide.id));
  }
  socket.emit("ride:updated", activeRide);

  socket.on("ride:getCurrent", (callback: (ride: Ride | null) => void) => {
    if (typeof callback === "function") callback(activeRide);
  });

  socket.on(
    "ride:request",
    (payload: { pickup: RideLocation; dropoff: RideLocation }) => {
      if (identity.role !== "passenger") return;
      if (activeRide) {
        socket.emit("ride:actionError", { message: "A ride is already active." });
        return;
      }
      if (!payload || !payload.pickup || !payload.dropoff) {
        socket.emit("ride:actionError", { message: "Invalid ride request." });
        return;
      }

      const ride: Ride = {
        id: randomUUID(),
        passengerId: PASSENGER_ID,
        driverId: DRIVER_ID,
        status: "REQUESTED",
        pickup: payload.pickup,
        dropoff: payload.dropoff,
        passengerOffer: null,
        driverOffer: null,
        agreedFare: null,
        turn: null,
        counterOffersUsed: { passenger: 0, driver: 0 },
        cancelReason: null,
        createdAt: Date.now(),
      };
      activeRide = ride;

      const room = rideRoomName(ride.id);
      socket.join(room);
      const driverSocketId = getSocketId(DRIVER_ID);
      if (driverSocketId) io.in(driverSocketId).socketsJoin(room);

      broadcast(io);
      ride.status = "BIDDING";
      broadcast(io);
      startNoBidTimer(io);
    }
  );

  socket.on("ride:decline", () => {
    if (identity.role !== "driver" || !activeRide || activeRide.status !== "BIDDING") return;
    if (activeRide.driverId !== identity.userId) return;
    resetNoDriverAvailable(io);
  });

  socket.on("ride:bid", (payload: { fare: number }) => {
    if (identity.role !== "driver" || !activeRide || activeRide.status !== "BIDDING") return;
    if (activeRide.driverId !== identity.userId) return;
    if (!payload || typeof payload.fare !== "number" || payload.fare <= 0) {
      socket.emit("ride:actionError", { message: "Invalid bid fare." });
      return;
    }

    activeRide.driverOffer = payload.fare;
    clearNegotiationTimer();

    // The driver's bid is the opening price — always goes to the passenger to
    // accept, counter, or reject.
    activeRide.status = "NEGOTIATING";
    activeRide.turn = "passenger";
    broadcast(io);
    startBidResponseTimer(io);
  });

  socket.on("ride:accept", () => {
    if (!activeRide || activeRide.status !== "NEGOTIATING") return;
    if (activeRide.turn !== identity.role) return;
    const expectedUserId = identity.role === "passenger" ? activeRide.passengerId : activeRide.driverId;
    if (identity.userId !== expectedUserId) return;

    clearNegotiationTimer();
    activeRide.agreedFare =
      identity.role === "passenger" ? activeRide.driverOffer : activeRide.passengerOffer;
    activeRide.status = "CONFIRMED";
    broadcast(io);
    advanceToDriverArriving(io);
  });

  socket.on("ride:counterOffer", (payload: { fare: number }) => {
    if (!activeRide || activeRide.status !== "NEGOTIATING") return;
    if (activeRide.turn !== identity.role) return;
    const expectedUserId = identity.role === "passenger" ? activeRide.passengerId : activeRide.driverId;
    if (identity.userId !== expectedUserId) return;

    const side = identity.role;
    if (activeRide.counterOffersUsed[side] >= COUNTER_OFFER_CAP) {
      // Branch 3: cap hit with no agreement reached.
      finishRide(io, "CANCELLED", "negotiation failed");
      return;
    }
    if (!payload || typeof payload.fare !== "number" || payload.fare <= 0) {
      socket.emit("ride:actionError", { message: "Invalid counter offer." });
      return;
    }

    activeRide.counterOffersUsed[side] += 1;
    if (side === "passenger") {
      activeRide.passengerOffer = payload.fare;
      activeRide.turn = "driver";
    } else {
      activeRide.driverOffer = payload.fare;
      activeRide.turn = "passenger";
    }
    broadcast(io);
    startBidResponseTimer(io);
  });

  // Explicit rejection of the offer currently on the table during negotiation —
  // distinct from ride:cancel, which only applies while still waiting on a bid.
  socket.on("ride:reject", () => {
    if (!activeRide || activeRide.status !== "NEGOTIATING") return;
    if (activeRide.turn !== identity.role) return;
    const expectedUserId = identity.role === "passenger" ? activeRide.passengerId : activeRide.driverId;
    if (identity.userId !== expectedUserId) return;
    finishRide(io, "CANCELLED", `rejected by ${identity.role}`);
  });

  socket.on("ride:cancel", () => {
    if (!activeRide || !CANCELLABLE_STATUSES.includes(activeRide.status)) return;
    const isParty = identity.userId === activeRide.passengerId || identity.userId === activeRide.driverId;
    if (!isParty) return;
    finishRide(io, "CANCELLED", `cancelled by ${identity.role}`);
  });

  socket.on("ride:arrived", () => {
    if (identity.role !== "driver" || !activeRide || activeRide.status !== "DRIVER_ARRIVING") return;
    if (activeRide.driverId !== identity.userId) return;
    activeRide.status = "DRIVER_ARRIVED";
    broadcast(io);
  });

  socket.on("ride:start", () => {
    if (identity.role !== "driver" || !activeRide || activeRide.status !== "DRIVER_ARRIVED") return;
    if (activeRide.driverId !== identity.userId) return;
    activeRide.status = "RIDE_STARTED";
    broadcast(io);
    activeRide.status = "RIDE_IN_PROGRESS";
    broadcast(io);
  });

  socket.on("ride:complete", () => {
    if (identity.role !== "driver" || !activeRide || activeRide.status !== "RIDE_IN_PROGRESS") return;
    if (activeRide.driverId !== identity.userId) return;
    finishRide(io, "RIDE_COMPLETED");
  });
}
