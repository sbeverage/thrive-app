import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const VoucherCard = ({ logo, brand, discounts }) => {
  return (
    <View style={styles.cardWrapper}>
      <View style={styles.card}>
        {/* Left Section with Logo */}
        <View style={styles.leftSide}>
          <Image source={logo} style={styles.logo} />
          <View style={styles.textContainer}>
            <Text style={styles.brand}>{brand}</Text>
            <Text style={styles.discounts}>{discounts} discounts available</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.notchTop} />
          <View style={styles.dottedLine} />
          <View style={styles.notchBottom} />
        </View>

        {/* Right Section */}
        <View style={styles.rightSide}>
          <MaterialCommunityIcons name="ticket-percent" size={24} color="#DB8C0E" />
        </View>
      </View>
    </View>
  );
};

const CARD_HEIGHT = 100;
const NOTCH_SIZE = 12;

const styles = StyleSheet.create({
  cardWrapper: {
    marginVertical: 10,
    marginHorizontal: 20,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    height: CARD_HEIGHT,
    overflow: 'hidden',
  },
  leftSide: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    resizeMode: 'contain',
  },
  textContainer: {
    flex: 1,
  },
  brand: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C4F7D', // branded blue
  },
  discounts: {
    fontSize: 14,
    color: '#DB8C0E',
    marginTop: 4,
  },
  dividerContainer: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notchTop: {
    width: NOTCH_SIZE * 2,
    height: NOTCH_SIZE,
    borderBottomLeftRadius: NOTCH_SIZE,
    borderBottomRightRadius: NOTCH_SIZE,
    backgroundColor: '#f6f6f6',
    alignSelf: 'center',
    marginTop: -NOTCH_SIZE / 2,
  },
  notchBottom: {
    width: NOTCH_SIZE * 2,
    height: NOTCH_SIZE,
    borderTopLeftRadius: NOTCH_SIZE,
    borderTopRightRadius: NOTCH_SIZE,
    backgroundColor: '#f6f6f6',
    alignSelf: 'center',
    marginBottom: -NOTCH_SIZE / 2,
  },
  dottedLine: {
    flex: 1,
    borderLeftWidth: 1,
    borderStyle: 'dotted',
    borderColor: '#ccc',
    width: 1,
    marginVertical: 4,
  },
  rightSide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF7EB',
  },
});

export default VoucherCard;
