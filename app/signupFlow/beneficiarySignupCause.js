import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { AntDesign, Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import SuccessModal from "../../components/SuccessModal";
import ConfettiCannon from "react-native-confetti-cannon";
import { useBeneficiary } from "../context/BeneficiaryContext";
import { useBeneficiaryFilter } from "../context/BeneficiaryFilterContext";
import { useLocation } from "../context/LocationContext";
import MapView, { Marker, Circle } from "react-native-maps";
import {
  getCurrentLocation,
  getDefaultRegion,
  calculateDistance,
  formatDistance,
} from "../utils/locationService";
import API from "../lib/api";
import SuggestCard from "../../components/SuggestCard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistSignupFlowCheckpointFromParams } from "../utils/signupFlowCheckpoint";
import { IMAGE_ASSETS } from "../utils/assetConstants";

export default function BeneficiaryPreferences() {
  const router = useRouter();
  const params = useLocalSearchParams();
  /** Detail screen lives under (tabs); pass this so success modal can continue signup. */
  const signupBeneficiaryDetailParams = (beneficiaryId) => {
    const out = {
      id: String(beneficiaryId),
      fromSignup: "true",
    };
    if (params?.flow === "coworking") {
      out.flow = "coworking";
      out.sponsorAmount = String(params?.sponsorAmount ?? "15");
    }
    return out;
  };
  const { selectedBeneficiary, setSelectedBeneficiary } = useBeneficiary();
  const { filters, updateFilters, clearFilters, hasActiveFilters } =
    useBeneficiaryFilter();
  const {
    location: userLocation,
    locationAddress,
    locationPermission,
    checkLocationPermission,
    refreshLocation,
    isLoadingLocation,
  } = useLocation();

  // ── Signup-specific: persist checkpoint ──────────────────────────────────
  const signupFlowParamsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams(
      "/signupFlow/beneficiarySignupCause",
      params,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupFlowParamsKey]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingBeneficiary, setPendingBeneficiary] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const beneficiarySectionRef = useRef(null);

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const saved = await AsyncStorage.getItem("beneficiaryFavorites");
        if (saved) {
          const parsed = JSON.parse(saved);
          setFavorites(Array.isArray(parsed) ? parsed : []);
        } else {
          setFavorites([]);
        }
      } catch {
        setFavorites([]);
      }
    };
    loadFavorites();
  }, []);

  useEffect(() => {
    const saveFavorites = async () => {
      try {
        await AsyncStorage.setItem(
          "beneficiaryFavorites",
          JSON.stringify(favorites),
        );
      } catch {}
    };
    saveFavorites();
  }, [favorites]);

  const [activeCategory, setActiveCategory] = useState("All");
  const [showMap, setShowMap] = useState(false);
  const [mapRegion, setMapRegion] = useState(getDefaultRegion());
  const [locationDisplay, setLocationDisplay] = useState(
    "Detecting location...",
  );
  const [locationSearch, setLocationSearch] = useState("");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [miniPopupVisible, setMiniPopupVisible] = useState(false);
  const [selectedBeneficiaryForPopup, setSelectedBeneficiaryForPopup] =
    useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);

  const categories = [
    "All",
    "Favorites",
    "Animal Welfare",
    "Arts & Culture",
    "Childhood Illness",
    "Disabilities",
    "Disaster Relief",
    "Education",
    "Elderly Care",
    "Environment",
    "Healthcare",
    "Homelessness",
    "Hunger Relief",
    "International Aid",
    "Low Income Families",
    "Veterans",
    "Youth Development",
  ];

  // ── Beneficiaries ─────────────────────────────────────────────────────────
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);

  const loadBeneficiaries = async () => {
    try {
      setLoadingBeneficiaries(true);
      const data = await API.getCharities();

      let charitiesArray = null;
      if (data?.charities && Array.isArray(data.charities)) {
        charitiesArray = data.charities;
      } else if (Array.isArray(data)) {
        charitiesArray = data;
      } else if (data?.data && Array.isArray(data.data)) {
        charitiesArray = data.data;
      }

      if (charitiesArray?.length > 0) {
        const transformed = charitiesArray.map((charity) => {
          let distanceStr = null;
          if (userLocation && charity.latitude && charity.longitude) {
            distanceStr = formatDistance(
              calculateDistance(
                userLocation.latitude,
                userLocation.longitude,
                charity.latitude,
                charity.longitude,
              ),
            );
          }

          let imageSource;
          if (charity.imageUrl) {
            imageSource = { uri: charity.imageUrl };
          } else if (charity.category === "Childhood Illness") {
            imageSource = require("../../assets/images/child-cancer.jpg");
          } else if (charity.category === "Animal Welfare") {
            imageSource = require("../../assets/images/humane-society.jpg");
          } else {
            imageSource = require("../../assets/images/charity-water.jpg");
          }

          return {
            id: charity.id,
            name: charity.name,
            category: charity.category,
            type: charity.type,
            image: imageSource,
            location: charity.location,
            latitude: charity.latitude,
            longitude: charity.longitude,
            distance: distanceStr,
            likes: charity.likes || 0,
            mutual: charity.mutual || 0,
            about: charity.about || "",
            ein: charity.ein || "",
            website: charity.website || "",
            phone: charity.phone || "",
            social: charity.social || "",
          };
        });
        setBeneficiaries(transformed);
      } else {
        setBeneficiaries([]);
      }
    } catch (error) {
      console.error("❌ Failed to load beneficiaries:", error.message);
      Alert.alert(
        "Could Not Load Charities",
        "There was a problem loading charities. Please check your connection and try again.",
        [{ text: "OK" }],
      );
      setBeneficiaries([]);
    } finally {
      setLoadingBeneficiaries(false);
    }
  };

  useEffect(() => {
    loadBeneficiaries();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBeneficiaries();
    }, []),
  );

  useEffect(() => {
    if (userLocation && beneficiaries.length > 0) {
      setBeneficiaries((prev) =>
        prev.map((b) => {
          if (b.latitude && b.longitude) {
            return {
              ...b,
              distance: formatDistance(
                calculateDistance(
                  userLocation.latitude,
                  userLocation.longitude,
                  b.latitude,
                  b.longitude,
                ),
              ),
            };
          }
          return b;
        }),
      );
    }
  }, [userLocation]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredBeneficiaries = beneficiaries.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchText.toLowerCase()) ||
      b.location.toLowerCase().includes(searchText.toLowerCase());

    let matchesCategory = true;
    if (activeCategory === "Favorites") {
      matchesCategory = favorites.includes(b.id);
    } else if (activeCategory !== "All") {
      matchesCategory = b.category === activeCategory;
    }

    const locFilter = (filters.location && filters.location.trim()) || "";
    const matchesLocation =
      !locFilter ||
      (b.location && b.location.toLowerCase().includes(locFilter.toLowerCase()));

    const matchesCause = !filters.cause || b.category === filters.cause;
    const matchesType = !filters.type || b.type === filters.type;
    const matchesFavorites =
      !filters.showFavorites || favorites.includes(b.id);
    const matchesEmergency = !filters.emergency;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesLocation &&
      matchesCause &&
      matchesType &&
      matchesFavorites &&
      matchesEmergency
    );
  });

  const highlightedBeneficiaries = filteredBeneficiaries.slice(0, 2);
  const remainingBeneficiaries = filteredBeneficiaries.slice(2);

  /** Same as tab: confirm in modal, then persist, set context, and continue signup. */
  const handleConfirmBeneficiary = async () => {
    if (!pendingBeneficiary) return;
    setConfirmModalVisible(false);
    const chosen = pendingBeneficiary;
    setPendingBeneficiary(null);
    try {
      await API.saveProfile({ beneficiary: chosen.id });
    } catch (e) {
      console.warn("⚠️ Could not persist beneficiary to server:", e.message);
    }
    try {
      await setSelectedBeneficiary(chosen);
      if (params?.flow === "coworking") {
        router.push({
          pathname: "/signupFlow/coworkingDonationPrompt",
          params: { sponsorAmount: params?.sponsorAmount || "15" },
        });
      } else {
        router.push({
          pathname: "/signupFlow/donationAmount",
          params: { beneficiaryId: chosen.id?.toString?.() ?? "" },
        });
      }
    } catch (error) {
      console.error("❌ Error selecting beneficiary:", error);
      Alert.alert("Error", "There was an error selecting this charity. Please try again.");
    }
  };

  const openBeneficiaryConfirm = (beneficiary) => {
    setPendingBeneficiary(beneficiary);
    setConfirmModalVisible(true);
  };

  const toggleFavorite = (id) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  };

  // ── Location helpers ──────────────────────────────────────────────────────
  const updateMapRegion = async () => {
    const loc = await getCurrentLocation();
    if (loc) {
      setMapRegion({
        latitude: loc.latitude,
        longitude: loc.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  const updateUserLocation = async () => {
    if (locationPermission === "granted") {
      setLocationSearch("");
      updateFilters({ location: "" });
      await refreshLocation();
    } else {
      checkLocationPermission();
    }
  };

  const getFriendlyLocationName = (latitude, longitude) => {
    if (latitude >= 34.05 && latitude <= 34.10 && longitude >= -84.35 && longitude <= -84.25) return "Alpharetta, GA";
    if (latitude >= 34.09 && latitude <= 34.12 && longitude >= -84.52 && longitude <= -84.50) return "Woodstock, GA";
    if (latitude >= 33.70 && latitude <= 33.80 && longitude >= -84.40 && longitude <= -84.35) return "Atlanta, GA";
    if (latitude >= 33.50 && latitude <= 34.50 && longitude >= -84.80 && longitude <= -84.00) return "Atlanta Metro, GA";
    return "Current Location";
  };

  useEffect(() => {
    if (showMap) updateMapRegion();
  }, [showMap]);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  useEffect(() => {
    const updateLocationDisplay = async () => {
      if (userLocation && locationPermission === "granted") {
        let display = "Current Location";
        if (locationAddress?.city && locationAddress?.state) {
          display = `${locationAddress.city}, ${locationAddress.state}`;
        } else if (userLocation.latitude && userLocation.longitude) {
          try {
            display = await getFriendlyLocationName(userLocation.latitude, userLocation.longitude);
          } catch {}
        }
        setLocationDisplay(display);
        setLocationSearch((prev) => (prev ? prev : display));
        setMapRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      } else if (locationPermission === "denied") {
        setLocationDisplay("Location not available");
      } else if (isLoadingLocation) {
        setLocationDisplay("Detecting location...");
      } else if (locationPermission === null) {
        setLocationDisplay("Tap to set location");
      }
    };
    updateLocationDisplay();
  }, [userLocation, locationAddress, locationPermission, isLoadingLocation]);

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText("");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <LinearGradient
        colors={["#2C3E50", "#4CA1AF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.miniBrandHeader}
      >
        <Image
          source={{ uri: IMAGE_ASSETS.INITIATIVE_LOGO_NO_WEB_WHITE }}
          style={styles.miniBrandLogo}
          resizeMode="contain"
        />
      </LinearGradient>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <Feather name="search" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search beneficiaries"
            placeholderTextColor="#6d6e72"
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.locationRow}>
          <MaterialIcons name="place" size={20} color="#6d6e72" style={{ marginRight: 6 }} />
          {isEditingLocation ? (
            <TextInput
              placeholder="Enter city or area (e.g. Atlanta)"
              placeholderTextColor="#6d6e72"
              value={locationSearch}
              onChangeText={(t) => {
                setLocationSearch(t);
                updateFilters({ location: t.trim() });
              }}
              style={styles.locationInput}
              autoFocus
              onBlur={() => setIsEditingLocation(false)}
              onSubmitEditing={() => setIsEditingLocation(false)}
            />
          ) : (
            <TouchableOpacity
              style={styles.locationDisplay}
              onPress={() => {
                setIsEditingLocation(true);
                if (!locationSearch) {
                  setLocationSearch(locationDisplay);
                  updateFilters({ location: locationDisplay.trim() });
                }
              }}
            >
              <Text style={styles.locationText}>{locationSearch || locationDisplay}</Text>
              <Feather name="edit-2" size={14} color="#DB8633" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.refreshLocationButton}
            onPress={updateUserLocation}
            disabled={isLoadingLocation}
          >
            <Feather
              name="refresh-cw"
              size={16}
              color={isLoadingLocation ? "#ccc" : "#DB8633"}
              style={isLoadingLocation ? { transform: [{ rotate: "180deg" }] } : {}}
            />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
          {categories.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.tag, activeCategory === tag && styles.tagActive]}
              onPress={() => setActiveCategory(tag)}
            >
              <View style={styles.tagContent}>
                {tag === "Favorites" && (
                  <Image
                    source={require("../../assets/icons/heart.png")}
                    style={[styles.tagIcon, { width: 14, height: 14, tintColor: activeCategory === tag ? "#D0861F" : "#666" }]}
                  />
                )}
                <Text style={[styles.tagText, activeCategory === tag && styles.tagTextActive]}>{tag}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {hasActiveFilters() && (
          <View style={styles.clearFiltersContainer}>
            <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
              <Feather name="x" size={16} color="#D0861F" />
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !showMap && styles.toggleActive]}
            onPress={() => setShowMap(false)}
          >
            <Feather name="list" size={16} color={!showMap ? "#fff" : "#666"} />
            <Text style={[styles.toggleText, !showMap && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, showMap && styles.toggleActive]}
            onPress={() => setShowMap(true)}
          >
            <Feather name="map" size={16} color={showMap ? "#fff" : "#666"} />
            <Text style={[styles.toggleText, showMap && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {showMap ? (
          <View style={styles.mapContainer}>
            {Platform.OS === "web" ? (
              <View style={[StyleSheet.absoluteFill, styles.webMapFallback]}>
                <Text style={styles.webMapText}>Map view is not available on web</Text>
                <Text style={styles.webMapSubtext}>Please use the mobile app for full map functionality</Text>
                <TouchableOpacity style={styles.switchToListButton} onPress={() => setShowMap(false)}>
                  <Text style={styles.switchToListButtonText}>Switch to List View</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <MapView
                style={StyleSheet.absoluteFill}
                initialRegion={mapRegion}
                region={mapRegion}
                showsUserLocation={true}
                showsMyLocationButton={false}
                onMapReady={updateMapRegion}
              >
                <Circle
                  center={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                  radius={15000}
                  strokeColor="#DB8633"
                  fillColor="rgba(219, 134, 51, 0.1)"
                />
                {!loadingBeneficiaries &&
                  filteredBeneficiaries
                    .filter((b) => b.latitude != null && b.longitude != null)
                    .map((b) => (
                      <Marker
                        key={b.id}
                        coordinate={{ latitude: parseFloat(b.latitude), longitude: parseFloat(b.longitude) }}
                        onPress={() => setSelectedMarker(b)}
                        tracksViewChanges={false}
                      >
                        <View style={styles.customMarkerContainer}>
                          <View style={styles.customMarkerBubble}>
                            {b.image && typeof b.image === "object" && b.image.uri ? (
                              <Image source={{ uri: b.image.uri }} style={styles.customMarkerLogo} resizeMode="cover" />
                            ) : (
                              <Feather name="heart" size={12} color="#fff" />
                            )}
                            <Text style={styles.customMarkerText} numberOfLines={1}>{b.name}</Text>
                          </View>
                          <View style={styles.customMarkerTail} />
                        </View>
                      </Marker>
                    ))}
              </MapView>
            )}

            <TouchableOpacity
              style={[styles.mapFilterBtn, styles.mapFilterBtnActive]}
              onPress={() => router.push("/signupFlow/beneficiaryFilter")}
            >
              <Feather name="filter" size={15} color="#fff" />
              <Text style={[styles.mapFilterBtnText, styles.mapFilterBtnTextActive]}>Filter</Text>
            </TouchableOpacity>

            {selectedMarker && (
              <View style={styles.infoWindow}>
                <View style={styles.infoWindowHeader}>
                  {selectedMarker.image && typeof selectedMarker.image === "object" && selectedMarker.image.uri ? (
                    <Image source={{ uri: selectedMarker.image.uri }} style={styles.infoWindowLogo} resizeMode="cover" />
                  ) : (
                    <View style={[styles.infoWindowLogo, styles.infoWindowLogoFallback]}>
                      <Feather name="heart" size={22} color="#21555b" />
                    </View>
                  )}
                  <View style={styles.infoWindowText}>
                    <Text style={styles.infoWindowTitle}>{selectedMarker.name}</Text>
                    <Text style={styles.infoWindowCategory}>{selectedMarker.category}</Text>
                    <Text style={styles.infoWindowLocation}>{selectedMarker.location}</Text>
                  </View>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedMarker(null)}>
                    <AntDesign name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
                <View style={styles.infoWindowActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      setSelectedMarker(null);
                      router.push({
                        pathname: "/(tabs)/beneficiary/beneficiaryDetail",
                        params: signupBeneficiaryDetailParams(selectedMarker.id),
                      });
                    }}
                  >
                    <Feather name="info" size={16} color="#fff" />
                    <Text style={styles.actionButtonText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonSecondary}
                    onPress={() => {
                      setSelectedMarker(null);
                      openBeneficiaryConfirm(selectedMarker);
                    }}
                  >
                    <Feather name="heart" size={16} color="#DB8633" />
                    <Text style={styles.actionButtonTextSecondary}>Select</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets={true}
            keyboardShouldPersistTaps="handled"
          >
            {loadingBeneficiaries ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <Text style={{ color: "#666", fontSize: 16 }}>Loading beneficiaries...</Text>
              </View>
            ) : filteredBeneficiaries.length > 0 ? (
              <>
                <View ref={beneficiarySectionRef}>
                  <View style={[styles.sectionHeader, { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }]}>
                    <TouchableOpacity
                      onPress={() => router.push("/signupFlow/beneficiaryFilter")}
                      style={[styles.filterBtn, hasActiveFilters() && styles.filterBtnActive]}
                    >
                      <Feather name="filter" size={15} color={hasActiveFilters() ? "#fff" : "#DB8633"} />
                      <Text style={[styles.filterBtnText, hasActiveFilters() && styles.filterBtnTextActive]}>Filter</Text>
                    </TouchableOpacity>
                  </View>

                  {highlightedBeneficiaries.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.beneficiaryCard,
                        selectedBeneficiary?.id === b.id && styles.selectedBeneficiaryCard,
                      ]}
                      onPress={() => {
                        setSelectedBeneficiaryForPopup(b);
                        setMiniPopupVisible(true);
                      }}
                    >
                      <Image source={b.image} style={styles.beneficiaryImage} />
                      <TouchableOpacity onPress={() => toggleFavorite(b.id)} style={styles.favoriteButton}>
                        {favorites.includes(b.id) ? (
                          <AntDesign name="heart" size={20} color="#DB8633" />
                        ) : (
                          <Image source={require("../../assets/icons/heart.png")} style={{ width: 20, height: 20, tintColor: "#DB8633" }} />
                        )}
                      </TouchableOpacity>
                      <View style={styles.beneficiaryCardContent}>
                        <Text style={styles.beneficiaryName}>{b.name}</Text>
                        <Text style={styles.beneficiaryCategory}>{b.category}</Text>
                        <View style={styles.beneficiaryLocation}>
                          <Ionicons name="location" size={14} color="#8E9BAE" />
                          <Text style={styles.beneficiaryLocationText}>{b.location} • {b.distance}</Text>
                        </View>
                        <View style={styles.buttonsRow}>
                          <TouchableOpacity
                            style={styles.viewDetailsButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              router.push({
                                pathname: "/(tabs)/beneficiary/beneficiaryDetail",
                                params: signupBeneficiaryDetailParams(b.id),
                              });
                            }}
                          >
                            <Text style={styles.viewDetailsButtonText}>Details</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.changeToThisButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              openBeneficiaryConfirm(b);
                            }}
                          >
                            <Text style={styles.changeToThisButtonText}>Select</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                {remainingBeneficiaries.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.beneficiaryCard,
                      selectedBeneficiary?.id === b.id && styles.selectedBeneficiaryCard,
                    ]}
                    onPress={() => {
                      setSelectedBeneficiaryForPopup(b);
                      setMiniPopupVisible(true);
                    }}
                  >
                    <Image source={b.image} style={styles.beneficiaryImage} />
                    <TouchableOpacity onPress={() => toggleFavorite(b.id)} style={styles.favoriteButton}>
                      {favorites.includes(b.id) ? (
                        <AntDesign name="heart" size={20} color="#DB8633" />
                      ) : (
                        <Image source={require("../../assets/icons/heart.png")} style={{ width: 20, height: 20, tintColor: "#DB8633" }} />
                      )}
                    </TouchableOpacity>
                    <View style={styles.beneficiaryCardContent}>
                      <Text style={styles.beneficiaryName}>{b.name}</Text>
                      <Text style={styles.beneficiaryCategory}>{b.category}</Text>
                      <View style={styles.beneficiaryLocation}>
                        <Ionicons name="location" size={14} color="#8E9BAE" />
                        <Text style={styles.beneficiaryLocationText}>{b.location} • {b.distance}</Text>
                      </View>
                      <View style={styles.buttonsRow}>
                        <TouchableOpacity
                          style={styles.viewDetailsButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push({
                              pathname: "/(tabs)/beneficiary/beneficiaryDetail",
                              params: signupBeneficiaryDetailParams(b.id),
                            });
                          }}
                        >
                          <Text style={styles.viewDetailsButtonText}>Details</Text>
                        </TouchableOpacity>
                        {selectedBeneficiary?.id !== b.id && (
                          <TouchableOpacity
                            style={styles.changeToThisButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              openBeneficiaryConfirm(b);
                            }}
                          >
                            <Text style={styles.changeToThisButtonText}>Select</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <View>
                <View style={[styles.sectionHeader, { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }]}>
                  <TouchableOpacity
                    onPress={() => router.push("/signupFlow/beneficiaryFilter")}
                    style={[styles.filterBtn, hasActiveFilters() && styles.filterBtnActive]}
                  >
                    <Feather name="filter" size={15} color={hasActiveFilters() ? "#fff" : "#DB8633"} />
                    <Text style={[styles.filterBtnText, hasActiveFilters() && styles.filterBtnTextActive]}>Filter</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No results found</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchText ? `No beneficiaries found for "${searchText}"` : "Try adjusting your search or filters"}
                  </Text>
                  <SuggestCard
                    type="charity"
                    searchQuery={searchText}
                    onSubmit={({ name, website }) =>
                      API.submitBeneficiaryRequest({ company_name: name, website })
                    }
                  />
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalBox}>
            <Text style={styles.modalText}>
              Are you sure you want &quot;{pendingBeneficiary?.name}&quot; to be your new beneficiary?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleConfirmBeneficiary} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setConfirmModalVisible(false);
                  setPendingBeneficiary(null);
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mini Popup */}
      <Modal
        visible={miniPopupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMiniPopupVisible(false)}
      >
        <TouchableOpacity
          style={styles.miniPopupOverlay}
          activeOpacity={1}
          onPress={() => setMiniPopupVisible(false)}
        >
          <TouchableOpacity style={styles.miniPopupContent} activeOpacity={1} onPress={() => {}}>
            <View style={styles.miniPopupHeader}>
              <Text style={styles.miniPopupTitle}>{selectedBeneficiaryForPopup?.name}</Text>
              <TouchableOpacity style={styles.miniPopupCloseButton} onPress={() => setMiniPopupVisible(false)}>
                <AntDesign name="close" size={20} color="#8E9BAE" />
              </TouchableOpacity>
            </View>
            <Text style={styles.miniPopupAbout}>
              {selectedBeneficiaryForPopup?.about || "Learn more about this amazing cause and the impact you can make in your local community."}
            </Text>
            <View style={styles.miniPopupButtons}>
              <TouchableOpacity
                style={styles.miniPopupChangeButton}
                onPress={() => {
                  setMiniPopupVisible(false);
                  openBeneficiaryConfirm(selectedBeneficiaryForPopup);
                }}
              >
                <Text style={styles.miniPopupChangeButtonText}>Select this cause</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.miniPopupLearnButton}
                onPress={() => {
                  setMiniPopupVisible(false);
                  router.push({
                    pathname: "/(tabs)/beneficiary/beneficiaryDetail",
                    params: signupBeneficiaryDetailParams(
                      selectedBeneficiaryForPopup?.id,
                    ),
                  });
                }}
              >
                <Text style={styles.miniPopupLearnButtonText}>Learn More</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <SuccessModal visible={showSuccessModal} onClose={closeModal} message={successMessage} />
      {confettiTrigger && (
        <ConfettiCannon
          count={100}
          origin={{ x: 200, y: 0 }}
          fadeOut
          explosionSpeed={350}
          fallSpeed={3000}
          onAnimationEnd={() => setConfettiTrigger(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  miniBrandHeader: {
    height: 96,
    paddingTop: 8,
    marginBottom: -22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBrandLogo: {
    width: 190,
    height: 60,
    opacity: 0.98,
    marginTop: -20,
  },
  header: {
    marginHorizontal: 16,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 15,
    backgroundColor: "#fff",
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    paddingHorizontal: 15,
    marginBottom: 16,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#324E58",
    height: 46,
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    paddingHorizontal: 15,
    marginBottom: 16,
    height: 48,
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    color: "#324E58",
  },
  locationDisplay: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  locationText: {
    fontSize: 16,
    color: "#324E58",
    fontWeight: "500",
  },
  refreshLocationButton: {
    padding: 8,
    marginLeft: 8,
  },
  tagsRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 20,
  },
  tag: {
    backgroundColor: "#f2f2f2",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginRight: 10,
  },
  tagActive: {
    backgroundColor: "#FFF5EB",
    borderWidth: 1,
    borderColor: "#D0861F",
  },
  tagContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  tagIcon: {
    marginRight: 6,
  },
  tagText: {
    fontSize: 14,
    color: "#6d6e72",
  },
  tagTextActive: {
    color: "#D0861F",
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5fa",
    borderRadius: 8,
    padding: 4,
    marginTop: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: "#DB8633",
  },
  toggleText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  toggleTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  clearFiltersContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D0861F",
    alignSelf: "flex-start",
  },
  clearFiltersText: {
    color: "#D0861F",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  content: {
    flex: 1,
    backgroundColor: "#f5f5fa",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 15,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 4,
    marginHorizontal: -20,
  },
  beneficiaryCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 100,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedBeneficiaryCard: {
    borderColor: "#DB8633",
  },
  beneficiaryImage: {
    width: 120,
    height: "100%",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    resizeMode: "cover",
  },
  favoriteButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 2,
  },
  beneficiaryCardContent: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  beneficiaryName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 4,
  },
  beneficiaryCategory: {
    fontSize: 13,
    color: "#6d6e72",
    marginBottom: 6,
  },
  beneficiaryLocation: {
    flexDirection: "row",
    alignItems: "center",
  },
  beneficiaryLocationText: {
    fontSize: 12,
    color: "#8E9BAE",
    marginLeft: 4,
  },
  viewDetailsButton: {
    backgroundColor: "#FFF5EB",
    borderWidth: 1,
    borderColor: "#DB8633",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flex: 1,
    marginRight: 8,
    alignItems: "center",
  },
  viewDetailsButtonText: {
    fontSize: 12,
    color: "#DB8633",
    fontWeight: "500",
  },
  changeToThisButton: {
    backgroundColor: "transparent",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    marginLeft: 8,
  },
  changeToThisButtonText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 13,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  emptyState: {
    flex: 1,
    paddingTop: 20,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 40,
  },
  // Map
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  mapFilterBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#DB8633",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 100,
  },
  mapFilterBtnActive: {
    backgroundColor: "#DB8633",
    borderColor: "#DB8633",
  },
  mapFilterBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DB8633",
  },
  mapFilterBtnTextActive: {
    color: "#fff",
  },
  customMarkerContainer: {
    alignItems: "center",
  },
  customMarkerBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#21555b",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 160,
    gap: 5,
  },
  customMarkerLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  customMarkerText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  customMarkerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#21555b",
  },
  infoWindow: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
  },
  infoWindowHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  infoWindowLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  infoWindowLogoFallback: {
    backgroundColor: "#e8f0f1",
    justifyContent: "center",
    alignItems: "center",
  },
  infoWindowText: {
    flex: 1,
  },
  infoWindowTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#324E58",
    marginBottom: 4,
  },
  infoWindowCategory: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  infoWindowLocation: {
    fontSize: 12,
    color: "#8E9BAE",
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5fa",
  },
  infoWindowActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DB8633",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DB8633",
    gap: 8,
  },
  actionButtonTextSecondary: {
    color: "#DB8633",
    fontSize: 14,
    fontWeight: "600",
  },
  webMapFallback: {
    backgroundColor: "#f5f5fa",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  webMapText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#324E58",
    textAlign: "center",
    marginBottom: 8,
  },
  webMapSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  switchToListButton: {
    backgroundColor: "#DB8633",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  switchToListButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#DB8633",
    backgroundColor: "#FFF5EB",
  },
  filterBtnActive: {
    backgroundColor: "#DB8633",
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DB8633",
  },
  filterBtnTextActive: {
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  confirmModalBox: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 12,
    width: "85%",
    alignItems: "center",
  },
  modalText: {
    fontSize: 16,
    color: "#324E58",
    marginBottom: 20,
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: "#DB8633",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginRight: 10,
  },
  confirmBtnText: {
    color: "white",
    fontWeight: "700",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#324E58",
    fontWeight: "700",
  },
  // Mini popup
  miniPopupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  miniPopupContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  miniPopupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  miniPopupTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    flex: 1,
    marginRight: 16,
  },
  miniPopupCloseButton: {
    padding: 4,
  },
  miniPopupAbout: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4A5568",
    marginBottom: 24,
  },
  miniPopupButtons: {
    gap: 12,
  },
  miniPopupChangeButton: {
    backgroundColor: "#DB8633",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  miniPopupChangeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  miniPopupLearnButton: {
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  miniPopupLearnButtonText: {
    color: "#4A5568",
    fontSize: 16,
    fontWeight: "500",
  },
});
