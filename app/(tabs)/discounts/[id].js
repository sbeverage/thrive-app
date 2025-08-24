import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
  Dimensions,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

const { height } = Dimensions.get('window');
const HEADER_HEIGHT = height * 0.3;

export default function VendorDetails() {
  const router = useRouter();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState(null);

  const vendor = {
    name: 'Starbucks',
    logo: require('../../../assets/logos/starbucks.png'),
    description:
      'Your daily coffee fix — from classic brews to seasonal favorites. With over 30,000 stores worldwide, Starbucks is known for more than just coffee. They provide cozy atmospheres, friendly baristas, and a curated selection of snacks and drinks. Whether it’s your morning fuel or a midday treat, Starbucks has something for everyone.',
    website: 'https://www.starbucks.com',
    phone: '770-317-8476',
    social: '@starbucks',
    tags: ['Coffee shop', 'Cookie shop', 'Burger point'],
    discounts: [
      { id: 1, title: 'Free Appetizer', note: 'up to 0/4 per month' },
      { id: 2, title: '$25 Off Entire Order', note: 'with a $75 min. purchase' },
      { id: 3, title: 'BOGO', note: 'Unlimited' },
    ],
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header Logo */}
      <View style={styles.header}>
        <Image source={vendor.logo} style={styles.logo} />
      </View>

      {/* Top Nav Back Button */}
      <View style={styles.topNav}>
        <TouchableOpacity onPress={() => router.push('/discounts')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      {/* Scrollable White Card */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.vendorName}>{vendor.name}</Text>

          <Text style={styles.sectionTitle}>About Us</Text>
          <Text style={styles.description}>{vendor.description}</Text>

          <Text style={styles.linkText}>
            <Text style={styles.bold}>Website: </Text>
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(vendor.website)}
            >
              {vendor.website.replace('https://', '')}
            </Text>
          </Text>

          <Text style={styles.linkText}>
            <Text style={styles.bold}>Phone: </Text>
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(`tel:${vendor.phone}`)}
            >
              {vendor.phone}
            </Text>
          </Text>

          <Text style={styles.linkText}>
            <Text style={styles.bold}>Social: </Text>
            <Text
              style={styles.link}
              onPress={() =>
                Linking.openURL(`https://instagram.com/${vendor.social.replace('@', '')}`)
              }
            >
              {vendor.social}
            </Text>
          </Text>

          <View style={styles.tags}>
            {vendor.tags.map((tag, i) => (
              <Text key={i} style={styles.tag}>{tag}</Text>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Available Discounts</Text>
          {vendor.discounts.map(discount => (
            <View key={discount.id} style={styles.discountCard}>
              <View>
                <Text style={styles.discountTitle}>{discount.title}</Text>
                <Text style={styles.discountNote}>{discount.note}</Text>
              </View>
              <TouchableOpacity
                style={styles.redeemBtn}
                onPress={() => {
                  setSelectedDiscount(discount);
                  setShowConfirmModal(true);
                }}
              >
                <Text style={styles.redeemText}>Redeem</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <AntDesign name="questioncircleo" size={48} color="#DB8633" />
            </View>
            <Text style={styles.modalTitle}>Ready to Redeem?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to redeem the{' '}
              <Text style={styles.modalHighlight}>
                {selectedDiscount?.title}
              </Text>{' '}
              discount?
            </Text>
            <Text style={styles.modalSubtitle}>
              This will generate your discount code
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={styles.modalCancelText}>No</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modalConfirmButton} 
                onPress={() => {
                  setShowConfirmModal(false);
                  router.push('/discounts/DiscountApproved');
                }}
              >
                <Text style={styles.modalConfirmText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    position: 'relative',
  },
  header: {
    position: 'absolute',
    top: 0,
    height: HEADER_HEIGHT,
    width: '100%',
    backgroundColor: '#90AFAF',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
    zIndex: 1,
  },
  logo: {
    width: 150,
    height: 150,
    resizeMode: 'contain',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
    zIndex: 10,
  },
  scroll: {
    flex: 1,
    zIndex: 2,
  },
  card: {
    backgroundColor: '#fff',
    marginTop: HEADER_HEIGHT - 130,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  vendorName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#324E58',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    marginTop: 20,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  linkText: {
    marginTop: 8,
    fontSize: 14,
  },
  bold: {
    fontWeight: 'bold',
    color: '#324E58',
  },
  link: {
    color: '#D0861F',
    textDecorationLine: 'underline',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  tag: {
    backgroundColor: '#E9ECEF',
    color: '#324E58',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
    fontSize: 13,
  },
  discountCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
  },
  discountTitle: {
    fontWeight: '600',
    color: '#324E58',
  },
  discountNote: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  redeemBtn: {
    backgroundColor: '#D0861F',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  redeemText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Modal Styles
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  modalIconContainer: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  modalHighlight: {
    color: '#DB8633',
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E9BAE',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
