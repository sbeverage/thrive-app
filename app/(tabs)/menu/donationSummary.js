// Full donationSummary.js with ScrollPicker integrated + fixes

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';

export default function DonationSummary() {
  const router = useRouter();

  // Sample data - replace with actual data from your backend
  const monthlyDonations = [
    { month: 'January 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'February 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'March 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'April 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'May 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'June 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'July 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'August 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'September 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'October 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'November 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'completed' },
    { month: 'December 2024', amount: 15, charity: 'St. Jude Children\'s Hospital', status: 'pending' },
  ];

  const totalDonated = monthlyDonations.filter(d => d.status === 'completed').reduce((sum, d) => sum + d.amount, 0);
  const currentCharity = monthlyDonations[0]?.charity || 'No charity selected';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Donation Summary</Text>
        <TouchableOpacity style={styles.downloadButton}>
          <Feather name="download" size={20} color="#DB8633" />
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Current Charity Card */}
        <View style={styles.charityCard}>
          <View style={styles.charityHeader}>
            <Image 
              source={require('../../../assets/images/child-cancer.jpg')} 
              style={styles.charityLogo} 
            />
            <View style={styles.charityInfo}>
              <Text style={styles.charityTitle}>Current Beneficiary</Text>
              <Text style={styles.charityName}>{currentCharity}</Text>
            </View>
          </View>
          <View style={styles.charityStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${totalDonated}</Text>
              <Text style={styles.statLabel}>Total Donated</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${15}</Text>
              <Text style={styles.statLabel}>Monthly Amount</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{monthlyDonations.filter(d => d.status === 'completed').length}</Text>
              <Text style={styles.statLabel}>Months Active</Text>
            </View>
          </View>
        </View>

        {/* Monthly Breakdown */}
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
          {monthlyDonations.map((donation, index) => (
            <View key={index} style={styles.donationRow}>
              <View style={styles.donationInfo}>
                <Text style={styles.donationMonth}>{donation.month}</Text>
                <Text style={styles.donationCharity}>{donation.charity}</Text>
              </View>
              <View style={styles.donationRight}>
                <Text style={styles.donationAmount}>${donation.amount}</Text>
                <View style={[
                  styles.statusDot, 
                  { backgroundColor: donation.status === 'completed' ? '#10B981' : '#F59E0B' }
                ]} />
              </View>
            </View>
          ))}
        </View>

        {/* Tax Summary */}
        <View style={styles.taxSection}>
          <Text style={styles.sectionTitle}>Tax Summary</Text>
          <View style={styles.taxCard}>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Total Donations (2024)</Text>
              <Text style={styles.taxValue}>${totalDonated}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Charity Name</Text>
              <Text style={styles.taxValue}>{currentCharity}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>EIN Number</Text>
              <Text style={styles.taxValue}>13-1351653</Text>
            </View>
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  scrollContainer: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#324E58' },
  downloadButton: {
    padding: 8,
  },
  charityCard: {
    backgroundColor: '#F5F5FA',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    alignItems: 'center',
  },
  charityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  charityLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  charityInfo: {
    flex: 1,
  },
  charityTitle: {
    fontSize: 14,
    color: '#324E58',
    marginBottom: 2,
  },
  charityName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DB8633',
  },
  charityStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
  },
  statLabel: {
    fontSize: 12,
    color: '#324E58',
    marginTop: 5,
  },
  statDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#eee',
  },
  breakdownSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#F5F5FA',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 15,
  },
  donationsList: {
    // No specific styles needed for ScrollView, content is handled by donationRow
  },
  donationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  donationInfo: {
    flex: 1,
  },
  donationMonth: {
    fontSize: 16,
    color: '#324E58',
    marginBottom: 2,
  },
  donationCharity: {
    fontSize: 14,
    color: '#666',
  },
  donationRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  donationAmount: {
    fontSize: 16,
    fontWeight: '500',
    color: '#324E58',
    marginRight: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  taxSection: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    backgroundColor: '#F5F5FA',
    borderRadius: 12,
  },
  taxCard: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  taxLabel: {
    fontSize: 14,
    color: '#324E58',
  },
  taxValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
  },
});
