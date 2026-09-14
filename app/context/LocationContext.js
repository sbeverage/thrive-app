import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getCurrentLocation, requestLocationPermission, getLocationWithAddress } from '../utils/locationService';

const LOCATION_PERMISSION_ASKED_KEY = '@location_permission_asked';

const LocationContext = createContext();

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  const [locationAddress, setLocationAddress] = useState(null); // { city, state, zipCode, country, street }
  const [locationPermission, setLocationPermission] = useState(null); // null, 'granted', 'denied'
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [hasAskedForPermission, setHasAskedForPermission] = useState(false);

  // Load saved preference on mount, and re-fetch location if permission already granted
  useEffect(() => {
    const loadSavedPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(LOCATION_PERMISSION_ASKED_KEY);
        if (saved === 'true') {
          setHasAskedForPermission(true);
          console.log('📍 Loaded saved location permission preference: already asked');
        }

        // Read the real OS status on every launch rather than only when our
        // own flag was written. The discounts and beneficiary screens also
        // call getCurrentLocation() directly, which prompts the OS without
        // going through this provider, so a donor can be genuinely granted
        // while this flag was never set. The old code gated the fetch on the
        // flag, so those donors kept a null location here and every screen
        // reading useLocation() sat on "Detecting location...". This only
        // reads the status, it never prompts.
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          setLocationPermission('granted');
          setIsLoadingLocation(true);
          try {
            const locationWithAddress = await getLocationWithAddress();
            if (locationWithAddress) {
              const { city, state, zipCode, country, street, ...coords } = locationWithAddress;
              setLocation(coords);
              setLocationAddress({ city, state, zipCode, country, street });
              console.log('📍 Location restored on app launch:', { city, state });
            }
          } catch (error) {
            console.error('Error fetching location on resume:', error);
          } finally {
            setIsLoadingLocation(false);
          }
        } else if (saved === 'true') {
          // Only call it a denial once we know we have actually asked. Before
          // that the status is merely undetermined, and recording 'denied'
          // would make screens render their "no location" state for someone
          // who was never given the choice.
          setLocationPermission('denied');
        }
      } catch (error) {
        console.error('Error loading location permission preference:', error);
      }
    };
    loadSavedPreference();
  }, []);

  const requestLocationAccess = async () => {
    setIsLoadingLocation(true);
    
    try {
      const hasPermission = await requestLocationPermission();
      
      if (hasPermission) {
        setLocationPermission('granted');
        // Get location with address (city, state, zip code)
        const locationWithAddress = await getLocationWithAddress();
        if (locationWithAddress) {
          const { city, state, zipCode, country, street, ...coords } = locationWithAddress;
          setLocation(coords);
          setLocationAddress({ city, state, zipCode, country, street });
          console.log('📍 Location obtained:', coords);
          console.log('📍 Location address:', { city, state, zipCode });
        }
      } else {
        setLocationPermission('denied');
        console.log('📍 Location permission denied');
      }
    } catch (error) {
      console.error('Error requesting location access:', error);
      setLocationPermission('denied');
    } finally {
      setIsLoadingLocation(false);
      setHasAskedForPermission(true);
      // Save preference to AsyncStorage
      try {
        await AsyncStorage.setItem(LOCATION_PERMISSION_ASKED_KEY, 'true');
        console.log('📍 Saved location permission preference: Enabled');
      } catch (error) {
        console.error('Error saving location permission preference:', error);
      }
    }
  };

  const showLocationPermissionAlert = (context = 'general') => {
    const messages = {
      signup: {
        title: "Find Local Charities",
        message: "Show charities and discounts near you for a better experience."
      },
      general: {
        title: "Enable Location", 
        message: "Find nearby charities and local discounts."
      }
    };

    const { title, message } = messages[context] || messages.general;

    Alert.alert(
      title,
      message,
      [
        {
          text: "Not Now",
          style: "cancel",
          onPress: async () => {
            setLocationPermission('denied');
            setHasAskedForPermission(true);
            // Save preference to AsyncStorage
            try {
              await AsyncStorage.setItem(LOCATION_PERMISSION_ASKED_KEY, 'true');
              console.log('📍 Saved location permission preference: Not Now');
            } catch (error) {
              console.error('Error saving location permission preference:', error);
            }
          }
        },
        {
          text: "Enable Location",
          style: "default",
          onPress: requestLocationAccess
        }
      ]
    );
  };

  const checkLocationPermission = async () => {
    try {
      // hasAskedForPermission is loaded from AsyncStorage a tick after mount,
      // so a caller that runs this on its own mount could read a stale false.
      // The OS status is the authority and is never stale.
      const { status: existing } = await Location.getForegroundPermissionsAsync();

      if (existing === 'granted') {
        setLocationPermission('granted');
        // Several screens call this on mount and on focus, so bail out once we
        // already hold a fix rather than running GPS and a reverse geocode
        // again. Callers that genuinely want a fresh position use
        // refreshLocation.
        if (location) return;
        const already = await getLocationWithAddress();
        if (already) {
          const { city, state, zipCode, country, street, ...coords } = already;
          setLocation(coords);
          setLocationAddress({ city, state, zipCode, country, street });
        }
        return;
      }

      // Already turned us down once, in this app or in Settings. Record it and
      // leave them alone, per App Store Review 5.1.1(iv).
      if (existing === 'denied') {
        setLocationPermission('denied');
        setHasAskedForPermission(true);
        try {
          await AsyncStorage.setItem(LOCATION_PERMISSION_ASKED_KEY, 'true');
        } catch (e) {
          console.warn('Could not persist location-permission preference:', e);
        }
        return;
      }

      const hasPermission = await requestLocationPermission();
      if (hasPermission) {
        setLocationPermission('granted');
        setHasAskedForPermission(true);
        try {
          await AsyncStorage.setItem(LOCATION_PERMISSION_ASKED_KEY, 'true');
        } catch (e) {
          console.warn('Could not persist location-permission preference:', e);
        }
        // Get location with address (city, state, zip code)
        const locationWithAddress = await getLocationWithAddress();
        if (locationWithAddress) {
          const { city, state, zipCode, country, street, ...coords } = locationWithAddress;
          setLocation(coords);
          setLocationAddress({ city, state, zipCode, country, street });
        }
      } else {
        // App Store Review 5.1.1(iv): do NOT re-ask after the user denies the
        // system permission. Just record the denial and move on. Screens that
        // depend on location surface their own inline "Enable in Settings"
        // CTA when the user actively engages a location-dependent feature.
        setLocationPermission('denied');
        setHasAskedForPermission(true);
        try {
          await AsyncStorage.setItem(LOCATION_PERMISSION_ASKED_KEY, 'true');
        } catch (e) {
          console.warn('Could not persist location-permission preference:', e);
        }
      }
    } catch (error) {
      console.error('Error checking location permission:', error);
      // Treat unexpected errors the same as a denial — never beg the user.
      setLocationPermission('denied');
      setHasAskedForPermission(true);
    }
  };

  const refreshLocation = async () => {
    if (locationPermission === 'granted') {
      setIsLoadingLocation(true);
      try {
        // Get location with address (city, state, zip code)
        const locationWithAddress = await getLocationWithAddress();
        if (locationWithAddress) {
          const { city, state, zipCode, country, street, ...coords } = locationWithAddress;
          setLocation(coords);
          const address = { city, state, zipCode, country, street };
          setLocationAddress(address);
          // Return it as well: a caller awaiting this still holds the old
          // locationAddress in its closure until the next render, so state
          // alone is not enough for "use my current location" to work.
          return address;
        }
      } catch (error) {
        console.error('Error refreshing location:', error);
      } finally {
        setIsLoadingLocation(false);
      }
    }
    return null;
  };

  const clearLocation = () => {
    setLocation(null);
    setLocationAddress(null);
    setLocationPermission(null);
    setHasAskedForPermission(false);
  };

  return (
    <LocationContext.Provider
      value={{
        location,
        locationAddress, // { city, state, zipCode, country, street }
        locationPermission,
        isLoadingLocation,
        hasAskedForPermission,
        requestLocationAccess,
        checkLocationPermission,
        refreshLocation,
        clearLocation,
        showLocationPermissionAlert,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
