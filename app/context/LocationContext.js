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

          // Check current permission status without prompting
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
          } else {
            setLocationPermission('denied');
          }
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
    if (hasAskedForPermission) return;
    
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
        }
      } else {
        // Show user-friendly permission request
        showLocationPermissionAlert();
      }
    } catch (error) {
      console.error('Error checking location permission:', error);
      showLocationPermissionAlert();
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
          setLocationAddress({ city, state, zipCode, country, street });
        }
      } catch (error) {
        console.error('Error refreshing location:', error);
      } finally {
        setIsLoadingLocation(false);
      }
    }
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
