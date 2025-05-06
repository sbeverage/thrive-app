import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';

export default function DonationSummary() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState('monthly');

  const monthlyDonations = [
    { month: 'January 2023', amount: 15 },
    { month: 'February 2023', amount: 10 },
    { month: 'March 2023', amount: 20 },
    { month: 'April 2023', amount: 15 },
    { month: 'May 2023', amount: 15 },
    { month: 'June 2023', amount: 15 },
    { month: 'July 2023', amount: 22 },
    { month: 'August 2023', amount: 25 },
    { month: 'September 2023', amount: 18 },
    { month: 'October 2023', amount: 15 },
    { month: 'November 2023', amount: 15 },
    { month: 'December', amount: 15 },
  ];

  const oneTimeGifts = [
    { org: 'United Way', date: '17 July, 2023', amount: 15, logo: require('../../../assets/logos/united-way.png') },
    { org: 'American Red Cross', date: '17 July, 2023', amount: 10, logo: require('../../../assets/logos/red-cross.png') },
    { org: 'Feeding America', date: '17 July, 2023', amount: 20, logo: require('../../../assets/logos/feeding-america.png') },
    { org: "St. Jude Children's Research Hospital", date: '17 July, 2023', amount: 15, logo: require('../../../assets/logos/st-jude.png') },
    { org: 'Habitat for Humanity', date: '17 July, 2023', amount: 5, logo: require('../../../assets/logos/habitat.png') },
  ];

  const handleMonthlyDetail = (month) => {
    console.log('Clicked month:', month);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Donation Summary</Text>
        <TouchableOpacity>
          <Feather name="download" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <TouchableOpacity
          onPress={() => setViewMode('monthly')}
          style={[styles.summaryCard, viewMode === 'monthly' ? styles.cardActive : styles.cardInactive]}
        >
          <View style={styles.circleBackground} />
          <View style={styles.cardContentWrapper}>
            <Text style={[styles.cardAmount, viewMode !== 'monthly' && styles.cardInactiveText]}>$596</Text>
            <Text style={[styles.cardLabel, viewMode !== 'monthly' && styles.cardInactiveText]}>Total Donation</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setViewMode('oneTime')}
          style={[styles.summaryCard, viewMode === 'oneTime' ? styles.cardActive : styles.cardInactive]}
        >
          <View style={styles.circleBackground} />
          <View style={styles.cardContentWrapper}>
            <Text style={[styles.cardAmount, viewMode !== 'oneTime' && styles.cardInactiveText]}>$100</Text>
            <Text style={[styles.cardLabel, viewMode !== 'oneTime' && styles.cardInactiveText]}>Total One Time Gifts</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {viewMode === 'monthly' &&
          monthlyDonations.map((item, index) => (
            <TouchableOpacity key={index} style={styles.row} onPress={() => handleMonthlyDetail(item.month)}>
              <Text style={styles.rowLabel}>{item.month}</Text>
              <View style={styles.amountWithArrow}>
                <Text style={styles.rowAmount}>${item.amount}</Text>
                <AntDesign name="right" size={16} color="#324E58" style={{ marginLeft: 5 }} />
              </View>
            </TouchableOpacity>
          ))}

        {viewMode === 'oneTime' &&
          oneTimeGifts.map((item, index) => (
            <View key={index} style={styles.orgRow}>
              <Image source={item.logo} style={styles.logo} />
              <View style={styles.orgInfo}>
                <Text style={styles.orgName}>{item.org}</Text>
                <Text style={styles.orgDate}>{item.date}</Text>
              </View>
              <Text style={styles.orgAmount}>${item.amount}</Text>
            </View>
          ))}

        {viewMode === 'oneTime' && (
          <View style={styles.supportSection}>
            <Text style={styles.supportText}>Questions?</Text>
            <Text style={styles.supportSubText}>Don’t worry, simply contact us 😊</Text>
            <TouchableOpacity style={styles.supportButton}>
              <Text style={styles.supportButtonText}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  summaryCard: {
    flex: 1,
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardContentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardActive: { backgroundColor: '#DB8633' },
  cardInactive: { backgroundColor: '#F5F5FA' },
  cardInactiveText: { color: '#324E58' },
  cardAmount: { fontSize: 24, fontWeight: 'bold', color: '#fff', zIndex: 1, textAlign: 'center' },
  cardLabel: { fontSize: 14, color: '#fff', marginTop: 4, zIndex: 1, textAlign: 'center' },
  circleBackground: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    top: -20,
    right: -20,
  },
  listContent: { paddingHorizontal: 20, paddingVertical: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowLabel: { fontSize: 16, color: '#324E58' },
  rowAmount: { fontSize: 16, fontWeight: '500', color: '#324E58' },
  amountWithArrow: { flexDirection: 'row', alignItems: 'center' },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  logo: { width: 36, height: 36, marginRight: 10, resizeMode: 'contain' },
  orgInfo: { flex: 1 },
  orgName: { fontSize: 16, color: '#324E58', fontWeight: '600' },
  orgDate: { fontSize: 12, color: '#888', marginTop: 2 },
  orgAmount: { fontSize: 16, fontWeight: '500', color: '#324E58' },
  supportSection: { alignItems: 'center', marginTop: 30 },
  supportText: { fontSize: 16, fontWeight: '600', color: '#324E58' },
  supportSubText: { fontSize: 14, color: '#324E58', marginTop: 6 },
  supportButton: {
    marginTop: 16,
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  supportButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});