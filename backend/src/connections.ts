// Fixed test identities (brief §23) — no auth/registration, so the backend just
// validates each socket handshake against these two known users.
export type UserRole = "passenger" | "driver";

export interface ConnectedUser {
  userId: string;
  role: UserRole;
  socketId: string;
}

export const KNOWN_USERS: Record<string, UserRole> = {
  passenger_01: "passenger",
  driver_01: "driver",
};

// userId -> current connection. Prototype-only: one active socket per fixed user.
export const connectedUsers = new Map<string, ConnectedUser>();

export function getSocketId(userId: string): string | undefined {
  return connectedUsers.get(userId)?.socketId;
}
