import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Map, Camera, Marker } from '@maplibre/maplibre-react-native';
import { OSM_STYLE, DEFAULT_CENTER } from '../mapStyle';
import type { DriverLocation, RideLocation } from '@beep/shared/dist/types';

interface DriverTrackingMapProps {
  pickup: RideLocation;
  dropoff: RideLocation;
  driverLocation: DriverLocation | null;
}

// Shows live driver position during an active ride. Unlike RideMap, this never
// needs the passenger's own GPS or any permission — only ride.pickup/dropoff
// (already known) and the driver's coords relayed over the socket.
export function DriverTrackingMap({ pickup, dropoff, driverLocation }: DriverTrackingMapProps) {
  // Centered once, on first render — doesn't re-center on every subsequent tick,
  // so it doesn't fight a user's manual pan/zoom every ~4s.
  const [center] = useState<[number, number]>(() => {
    if (driverLocation) return [driverLocation.lng, driverLocation.lat];
    return [pickup.lng, pickup.lat];
  });

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.mapContainer, styles.webFallback]}>
        <Text style={styles.webFallbackText}>
          Map preview isn't available on web — this needs a real device or emulator build.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <Map style={styles.mapFill} mapStyle={OSM_STYLE}>
        <Camera center={center} zoom={14} />
        <Marker id="pickup" lngLat={[pickup.lng, pickup.lat]}>
          <View style={[styles.pin, { backgroundColor: '#16A34A' }]} />
        </Marker>
        <Marker id="dropoff" lngLat={[dropoff.lng, dropoff.lat]}>
          <View style={[styles.pin, { backgroundColor: '#DC2626' }]} />
        </Marker>
        {driverLocation && (
          <Marker id="driver" lngLat={[driverLocation.lng, driverLocation.lat]}>
            <View style={[styles.pin, { backgroundColor: '#2563EB' }]} />
          </Marker>
        )}
      </Map>
      {!driverLocation && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>Waiting for driver's location…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    width: '100%',
    height: 520,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapFill: {
    flex: 1,
  },
  webFallback: {
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  webFallbackText: {
    color: '#475569',
    textAlign: 'center',
    fontSize: 14,
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  permissionBanner: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderRadius: 8,
    padding: 8,
  },
  permissionText: {
    color: '#92400E',
    fontSize: 12,
    textAlign: 'center',
  },
});
