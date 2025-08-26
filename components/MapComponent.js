import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

// This component will only render maps on mobile, showing a fallback on web
export default function MapComponent({ 
  children, 
  style, 
  initialRegion, 
  onMarkerPress,
  onSwitchToList 
}) {
  // On web, show fallback
  if (Platform.OS === 'web') {
    return (
      <View style={[style, styles.webMapFallback]}>
        <Text style={styles.webMapText}>Map view is not available on web</Text>
        <Text style={styles.webMapSubtext}>Please use the mobile app for full map functionality</Text>
        {onSwitchToList && (
          <TouchableOpacity 
            style={styles.switchToListButton}
            onPress={onSwitchToList}
          >
            <Text style={styles.switchToListButtonText}>Switch to List View</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // On mobile, render the actual map component
  const MapView = require('react-native-maps').default;
  const { Marker, Circle } = require('react-native-maps');
  
  return (
    <MapView style={style} initialRegion={initialRegion}>
      {children}
    </MapView>
  );
}

const styles = StyleSheet.create({
  webMapFallback: {
    backgroundColor: '#f5f5fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webMapText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
  },
  webMapSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  switchToListButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  switchToListButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

