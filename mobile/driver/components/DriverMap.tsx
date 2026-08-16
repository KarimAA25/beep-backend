import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Map, Camera, UserLocation } from '@maplibre/maplibre-react-native';
import { OSM_STYLE, DEFAULT_CENTER } from '../mapStyle';

// Shows the driver's own live position. Streaming this location to the passenger
// during an active ride (with a background foreground-service for when the app
// is backgrounded) is Phase 6 — this is just the map groundwork for that.
export function DriverMap() {
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
        <UserLocation animated />
      </Map>
      {permissionDenied && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Location permission denied — showing Beirut instead of your position.
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
