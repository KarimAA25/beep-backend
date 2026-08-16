import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Map, Camera, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import { OSM_STYLE, DEFAULT_CENTER } from '../mapStyle';
import type { RideLocation } from '@beep/shared/dist/types';

interface RideMapProps {
  pickup: RideLocation | null;
  dropoff: RideLocation | null;
  onSetPickup: (loc: RideLocation) => void;
  onSetDropoff: (loc: RideLocation) => void;
}

export function RideMap({ pickup, dropoff, onSetPickup, onSetDropoff }: RideMapProps) {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setCenter([position.coords.longitude, position.coords.latitude]);
    })();
  }, []);

  // MapLibre's native module has no web target — this is the one screen that
  // fundamentally can't be verified in the Chrome preview, only on-device.
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
      <Map
        style={styles.mapFill}
        mapStyle={OSM_STYLE}
        onPress={(event) => {
          const [lng, lat] = event.nativeEvent.lngLat;
          if (!pickup) {
            onSetPickup({ lat, lng });
          } else if (!dropoff) {
            onSetDropoff({ lat, lng });
          }
        }}
      >
        <Camera center={center} zoom={14} />
        <UserLocation animated />
        {pickup && (
          <Marker id="pickup" lngLat={[pickup.lng, pickup.lat]}>
            <View style={[styles.pin, { backgroundColor: '#16A34A' }]} />
          </Marker>
        )}
        {dropoff && (
          <Marker id="dropoff" lngLat={[dropoff.lng, dropoff.lat]}>
            <View style={[styles.pin, { backgroundColor: '#DC2626' }]} />
          </Marker>
        )}
      </Map>
      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Location permission denied — centered on Beirut. You can still tap the map to set
            locations manually.
          </Text>
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
