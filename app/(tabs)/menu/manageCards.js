import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';

export default function CardManagement() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [cards, setCards] = useState([
    { id: 1, type: 'Visa', last4: '4475', active: true, logo: require('../../../assets/logos/visa.png') },
    { id: 2, type: 'Master', last4: '6578', active: false, logo: require('../../../assets/logos/mastercard.png') },
  ]);

  // Apple Pay status - replace with actual detection logic
  const [applePayEnabled, setApplePayEnabled] = useState(true);
  const [applePayActive, setApplePayActive] = useState(false);

  // Handle new card data from Add New Card page
  useEffect(() => {
    if (params.newCard) {
      try {
        const newCardData = JSON.parse(params.newCard);
        addNewCard(newCardData);
        
        // Clear the params to prevent re-adding on re-render
        router.setParams({ newCard: undefined });
      } catch (error) {
        console.error('Error parsing new card data:', error);
      }
    }
  }, [params.newCard]);

  const handleDelete = (id) => {
    Alert.alert(
      'Delete Card',
      'Are you sure you want to delete this card?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            setCards((prevCards) => prevCards.filter((card) => card.id !== id));
            Alert.alert('Card deleted successfully!');
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleSetPrimary = (id) => {
    setCards((prevCards) =>
      prevCards.map((card) => ({ ...card, active: card.id === id }))
    );
    setApplePayActive(false);
  };

  const handleApplePayToggle = () => {
    if (applePayEnabled) {
      setApplePayActive(!applePayActive);
      // Deactivate all cards when Apple Pay is selected
      setCards((prevCards) =>
        prevCards.map((card) => ({ ...card, active: false }))
      );
    }
  };

  const addNewCard = (newCardData) => {
    // Determine logo based on card type
    let logo;
    switch (newCardData.type) {
      case 'Visa':
        logo = require('../../../assets/logos/visa.png');
        break;
      case 'Master':
        logo = require('../../../assets/logos/mastercard.png');
        break;
      case 'Amex':
        logo = require('../../../assets/logos/visa.png'); // Using visa as placeholder for Amex
        break;
      default:
        logo = require('../../../assets/logos/visa.png');
    }

    const newCard = {
      id: Date.now(), // Generate unique ID
      type: newCardData.type || 'Card',
      last4: newCardData.last4 || '0000',
      active: newCardData.setAsDefault, // Set as active if it should be default
      logo,
    };

    if (newCardData.setAsDefault) {
      // Deactivate all other cards when setting new one as default
      setCards((prevCards) =>
        prevCards.map((card) => ({ ...card, active: false }))
      );
      setApplePayActive(false); // Deactivate Apple Pay if card is set as default
      
      // Show success message for setting as default
      setTimeout(() => {
        Alert.alert(
          '✅ Card Set as Default',
          `Your new ${newCardData.type} card ending in ${newCardData.last4} is now your default payment method.`
        );
      }, 500);
    }

    setCards((prevCards) => [...prevCards, newCard]);
  };

  return (
    <View style={styles.container}>
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Billing</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Apple Pay Section */}
      {applePayEnabled && (
        <View style={styles.applePaySection}>
          <Text style={styles.sectionTitle}>Digital Wallets</Text>
          <TouchableOpacity
            style={[styles.applePayItem, applePayActive && styles.activeApplePay]}
            onPress={handleApplePayToggle}
          >
            <View style={styles.applePayDetails}>
              <View style={styles.radioCircle}>
                <View style={[styles.innerCircle, applePayActive && styles.innerCircleActive]} />
              </View>
              <View style={styles.applePayLogo}>
                <Text style={styles.applePayText}>Apple Pay</Text>
              </View>
              <View>
                <Text style={styles.applePayTitle}>Apple Pay</Text>
                <Text style={styles.applePaySubtitle}>Secure digital payments</Text>
              </View>
            </View>
            <View style={styles.applePayStatus}>
              {applePayActive ? (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              ) : (
                <Text style={styles.inactiveText}>Inactive</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Credit Cards Section */}
      <View style={styles.creditCardSection}>
        <Text style={styles.sectionTitle}>Credit & Debit Cards</Text>
        <View style={styles.cardList}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={[styles.cardItem, card.active && styles.activeCard]}
              onPress={() => handleSetPrimary(card.id)}
            >
              <View style={styles.cardDetails}>
                <View style={styles.radioCircle}>
                  <View style={[styles.innerCircle, card.active && styles.innerCircleActive]} />
                </View>
                <Image source={card.logo} style={styles.cardLogo} />
                <View>
                  <Text style={styles.cardType}>{card.type} card</Text>
                  <Text style={styles.cardNumber}>{card.last4}******</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDelete(card.id)}>
                <Feather name="trash-2" size={22} color="red" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Add New Card */}
      <TouchableOpacity style={styles.addButton} onPress={() => router.push('/menu/addNewCard')}>
        <Text style={styles.addButtonText}>Add New Card</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 5,
    marginBottom: 20,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  cardList: { paddingHorizontal: 20, marginTop: 20 },
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activeCard: {
    borderWidth: 1,
    borderColor: '#DB8633',
  },
  cardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  innerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'transparent',
  },
  innerCircleActive: {
    backgroundColor: '#DB8633',
  },
  cardLogo: { width: 40, height: 24, resizeMode: 'contain', marginRight: 10 },
  cardType: { fontSize: 14, color: '#666' },
  cardNumber: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  addButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    marginHorizontal: 20,
    borderRadius: 10,
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  applePaySection: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 15,
  },
  applePayItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    position: 'relative',
  },
  activeApplePay: {
    borderWidth: 1,
    borderColor: '#DB8633',
  },
  applePayDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  applePayLogo: {
    width: 80,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  applePayText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  applePayTitle: { fontSize: 16, fontWeight: '600', color: '#324E58' },
  applePaySubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  applePayStatus: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  activeBadge: {
    backgroundColor: '#DB8633',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  activeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  inactiveText: { 
    fontSize: 12, 
    color: '#666',
    fontWeight: '500',
  },
  creditCardSection: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
});
