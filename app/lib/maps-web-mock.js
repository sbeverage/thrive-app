// Web stub for react-native-maps
import React from 'react';
import { View } from 'react-native';

const MapView = ({ children, style }) => <View style={style}>{children}</View>;
MapView.Animated = MapView;

export default MapView;
export const Marker = () => null;
export const Callout = () => null;
export const Circle = () => null;
export const Polygon = () => null;
export const Polyline = () => null;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
