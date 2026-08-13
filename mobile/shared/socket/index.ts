import { io, Socket } from 'socket.io-client';
import type { UserRole } from '../types';

export interface SocketIdentity {
  userId: string;
  role: UserRole;
}

export function createSocket(url: string, identity: SocketIdentity): Socket {
  // websocket-only: avoids XHR long-polling quirks inside React Native's networking stack
  // auth carries the fixed identity as part of the connection handshake (brief Phase 2)
  return io(url, { transports: ['websocket'], autoConnect: true, auth: identity });
}

export type { Socket };
