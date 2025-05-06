import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';

export default function CardManagement() {
  const router = useRouter();

  const [cards, setCards] = useState([
    { id: 1, type: 'Visa', last4: '4475', active: true, logo: require('../../../assets/logos/visa.png') },
    { id: 2, type: 'Master', last4: '6578', active: false, logo: require('../../../assets/logos/mastercard.png') },
  ]);

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
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Card Management</Text>
        <Feather name="more-horizontal" size={24} color="transparent" />
      </View>

      {/* Card List */}
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

      {/* Add New Card */}
      <TouchableOpacity style={styles.addButton} onPress={() => router.push('/menu/addNewCard')}>
        <Text style={styles.addButtonText}>Add New Card</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#324E58' },
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
});
