import React from 'react';
import { Platform } from 'react-native';

// This component only renders on mobile platforms
export default function MapWrapper({ children, ...props }) {
  // On web, don't render anything
  if (Platform.OS === 'web') {
    return null;
  }

  // On mobile, render the map components
  const MapView = require('react-native-maps').default;
  const { Marker, Circle } = require('react-native-maps');
  
  return (
    <MapView {...props}>
      {children}
    </MapView>
  );
}

// Export the components for use in parent components
export const MapMarker = ({ ...props }) => {
  if (Platform.OS === 'web') return null;
  const { Marker } = require('react-native-maps');
  return <Marker {...props} />;
};

export const MapCircle = ({ ...props }) => {
  if (Platform.OS === 'web') return null;
  const { Circle } = require('react-native-maps');
  return <Circle {...props} />;
};

