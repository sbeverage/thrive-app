import * as Location from 'expo-location';
import { Platform } from 'react-native';

export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
};

export const getCurrentLocation = async () => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
};

/**
 * Reverse geocode coordinates to get city, state, and zip code
 * Uses Expo Location's reverse geocoding API (free, no API key required)
 */
export const reverseGeocode = async (latitude, longitude) => {
  try {
    console.log('📍 Reverse geocoding coordinates:', { latitude, longitude });
    
    // Use Expo Location's reverse geocoding (works on native platforms)
    if (Platform.OS !== 'web') {
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addresses && addresses.length > 0) {
        const address = addresses[0];
        const result = {
          city: address.city || address.subAdministrativeArea || null,
          state: address.region || address.administrativeArea || null,
          zipCode: address.postalCode || null,
          country: address.country || null,
          street: address.street || null,
        };
        console.log('📍 Reverse geocoded result:', result);
        return result;
      }
    } else {
      // For web, use a free reverse geocoding API
      // Using OpenCage Geocoding API (free tier: 2,500 requests/day)
      // You can get a free API key at: https://opencagedata.com/api
      // For now, we'll use a fallback that works without API key
      
      // Option 1: Use browser's geolocation API (if available)
      // This is a simple fallback - you may want to add your own API key
      try {
        // Using a free reverse geocoding service (Nominatim - OpenStreetMap)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'ThriveApp/1.0', // Required by Nominatim
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const address = data.address || {};
          
          const result = {
            city: address.city || address.town || address.village || address.municipality || null,
            state: address.state || address.region || null,
            zipCode: address.postcode || null,
            country: address.country || null,
            street: address.road || null,
          };
          console.log('📍 Reverse geocoded result (web):', result);
          return result;
        }
      } catch (webError) {
        console.error('Error with web reverse geocoding:', webError);
      }
    }

    console.warn('📍 No address found for coordinates');
    return {
      city: null,
      state: null,
      zipCode: null,
      country: null,
      street: null,
    };
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return {
      city: null,
      state: null,
      zipCode: null,
      country: null,
      street: null,
    };
  }
};

/**
 * Get location with reverse geocoding (city, state, zip code)
 */
export const getLocationWithAddress = async () => {
  try {
    const location = await getCurrentLocation();
    if (!location) {
      return null;
    }

    const address = await reverseGeocode(location.latitude, location.longitude);
    
    return {
      ...location,
      ...address,
    };
  } catch (error) {
    console.error('Error getting location with address:', error);
    return null;
  }
};

/**
 * Get friendly location name from coordinates
 * Falls back to hardcoded ranges if reverse geocoding fails
 */
export const getFriendlyLocationName = async (latitude, longitude) => {
  try {
    // Try reverse geocoding first
    const address = await reverseGeocode(latitude, longitude);
    
    if (address.city && address.state) {
      return `${address.city}, ${address.state}`;
    }
    
    // Fallback to hardcoded ranges if reverse geocoding fails
    // Alpharetta area (roughly)
    if (latitude >= 34.05 && latitude <= 34.10 && longitude >= -84.35 && longitude <= -84.25) {
      return 'Alpharetta, GA';
    }
    // Woodstock area (roughly)
    else if (latitude >= 34.09 && latitude <= 34.12 && longitude >= -84.52 && longitude <= -84.50) {
      return 'Woodstock, GA';
    }
    // Canton area (roughly)
    else if (latitude >= 34.20 && latitude <= 34.25 && longitude >= -84.50 && longitude <= -84.45) {
      return 'Canton, GA';
    }
    // Atlanta area (roughly)
    else if (latitude >= 33.70 && latitude <= 33.80 && longitude >= -84.40 && longitude <= -84.35) {
      return 'Atlanta, GA';
    }
    // General Atlanta metro area
    else if (latitude >= 33.50 && latitude <= 34.50 && longitude >= -84.80 && longitude <= -84.00) {
      return 'Atlanta Metro, GA';
    }
    else {
      return 'Current Location';
    }
  } catch (error) {
    console.error('Error getting friendly location name:', error);
    return 'Current Location';
  }
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in miles
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return null;
  }

  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

/**
 * Format distance for display
 */
export const formatDistance = (distanceInMiles) => {
  if (!distanceInMiles) {
    return null;
  }
  
  if (distanceInMiles < 0.1) {
    return '< 0.1 mi';
  } else if (distanceInMiles < 1) {
    return `${distanceInMiles.toFixed(1)} mi`;
  } else {
    return `${distanceInMiles.toFixed(1)} mi`;
  }
};

export const getDefaultRegion = () => {
  // Default to Alpharetta, GA area where user is located
  return {
    latitude: 34.0754,
    longitude: -84.2941,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };
};
