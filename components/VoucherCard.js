import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const VoucherCard = ({ logo, brand, discounts, discountId, vendor, onPress, vendorId }) => {
  const router = useRouter();

  const getDiscountLabel = () => {
    if (typeof discounts === 'number') {
      return `${discounts} discount${discounts === 1 ? '' : 's'} available`;
    }
    if (typeof discounts === 'string' && discounts.trim()) {
      return discounts;
    }
    return 'Discounts available';
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (vendorId || vendor?.id) {
      // Navigate to vendor details page to see all discounts for this vendor
      const id = vendorId || vendor?.id;
      router.push({
        pathname: '/(tabs)/discounts/[id]',
        params: { id: id.toString() }
      });
    } else if (discountId) {
      // Fallback: Navigate to discount details page if no vendor ID
      router.push({
        pathname: '/(tabs)/discounts/discountDetails',
        params: { discountId: discountId }
      });
    }
  };
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85}>
      <View style={styles.cardWrapper}>
        <View style={styles.card}>
          {/* Left Section with Logo */}
          <View style={styles.leftSide}>
            <Image 
              source={
                logo 
                  ? (typeof logo === 'string' ? { uri: logo } : logo)
                  : require('../assets/images/logos/starbucks.png')
              }
              style={styles.logo}
              defaultSource={require('../assets/images/logos/starbucks.png')}
              onError={(error) => {
                console.error('❌ Error loading vendor logo:', error);
                console.log('Logo source:', logo);
              }}
            />
            <View style={styles.textContainer}>
              <Text style={styles.brand}>{brand}</Text>
              <Text style={styles.discountBadge}>{getDiscountLabel()}</Text>
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
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 24 }}>🎫</Text>
            ) : (
              <MaterialCommunityIcons name="ticket-percent" size={24} color="#DB8C0E" />
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
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
    color: '#1C4F7D',
  },
  discountBadge: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
    color: '#DB8C0E',
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
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
