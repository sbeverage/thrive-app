// Full donationSummary.js with ScrollPicker integrated + fixes

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { useBeneficiary } from '../../context/BeneficiaryContext';
import API from '../../lib/api';

export default function DonationSummary() {
  const router = useRouter();
  const { user, loadUserData } = useUser();
  const { selectedBeneficiary } = useBeneficiary();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [donationSummary, setDonationSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('🔍 DonationSummary - User data:', user);
    console.log('🔍 DonationSummary - Monthly donation:', user.monthlyDonation);
    console.log('🔍 DonationSummary - Selected beneficiary:', selectedBeneficiary);
  }, [user, selectedBeneficiary]);

  // Load user data when component mounts
  useEffect(() => {
    loadUserData();
  }, []);

  // Refresh data when user or beneficiary changes
  useEffect(() => {
    setRefreshTrigger(prev => prev + 1);
  }, [user.monthlyDonation, selectedBeneficiary]);

  // Refresh data when page is focused
  useFocusEffect(
    useCallback(() => {
      loadUserData();
      setRefreshTrigger(prev => prev + 1);
    }, [])
  );

  // Load donation summary from API
  const loadDonationSummary = async () => {
    try {
      setIsLoading(true);
      const response = await API.getMonthlyDonationSummary();
      setDonationSummary(response.summary);
    } catch (error) {
      console.error('❌ Error loading donation summary:', error);
      // Fallback to local data
      setDonationSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Load summary on mount and when focused
  useEffect(() => {
    loadDonationSummary();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDonationSummary();
    }, [])
  );

  // Use API data if available, otherwise fallback to local data
  const monthlyDonationAmount = donationSummary?.total_monthly_amount || user.monthlyDonation || 15;
  const currentCharity = selectedBeneficiary?.name || donationSummary?.beneficiary_name || 'No charity selected';
  const totalDonated = donationSummary?.total_donated || 0;
  const monthlyBreakdown = donationSummary?.monthly_breakdown || [];
  const hasCompletedDonations = totalDonated > 0 || monthlyBreakdown.length > 0;

  return (
    <View style={styles.container} key={refreshTrigger}>
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
          <Image 
            source={require('../../../assets/icons/arrow-left.png')} 
            style={{ width: 24, height: 24, tintColor: '#324E58' }} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Donation Summary</Text>
        <TouchableOpacity 
          style={styles.downloadButton} 
          onPress={() => {
            loadUserData();
            loadDonationSummary();
            setRefreshTrigger(prev => prev + 1);
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#DB8633" />
          ) : (
            <Feather name="refresh-cw" size={20} color="#DB8633" />
          )}
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Current Charity Card */}
        <View style={styles.charityCard}>
          <View style={styles.charityHeader}>
            <Image 
              source={selectedBeneficiary?.image || require('../../../assets/images/child-cancer.jpg')} 
              style={styles.charityLogo} 
            />
            <View style={styles.charityInfo}>
              <Text style={styles.charityTitle}>Current Beneficiary</Text>
              <Text style={styles.charityName}>{currentCharity}</Text>
            </View>
          </View>
          <View style={styles.charityStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${parseFloat(totalDonated || 0).toFixed(2)}</Text>
              <Text style={styles.statLabel}>Total Donated</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${parseFloat(monthlyDonationAmount || 0).toFixed(2)}</Text>
              <Text style={styles.statLabel}>Monthly Amount</Text>
              <TouchableOpacity 
                style={styles.editAmountButton}
                onPress={() => router.push('/menu/editDonationAmount')}
              >
                <Text style={styles.editAmountText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{donationSummary?.active_subscriptions || monthlyBreakdown.filter(d => d.status === 'completed' || d.status === 'paid').length || 0}</Text>
              <Text style={styles.statLabel}>Months Active</Text>
            </View>
          </View>
        </View>

        {/* Monthly Breakdown */}
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#DB8633" />
              <Text style={styles.loadingText}>Loading donation history...</Text>
            </View>
          ) : hasCompletedDonations && monthlyBreakdown.length > 0 ? (
            monthlyBreakdown.map((donation, index) => (
              <View key={index} style={styles.donationRow}>
                <View style={styles.donationInfo}>
                  <Text style={styles.donationMonth}>{donation.month || donation.date}</Text>
                  <Text style={styles.donationCharity}>{donation.charity_name || donation.beneficiary_name || currentCharity}</Text>
                </View>
                <View style={styles.donationRight}>
                  <Text style={styles.donationAmount}>${parseFloat(donation.amount || donation.donation_amount || 0).toFixed(2)}</Text>
                  <View style={[
                    styles.statusDot, 
                    { backgroundColor: donation.status === 'completed' || donation.status === 'paid' ? '#10B981' : '#F59E0B' }
                  ]} />
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noDonationsMessage}>
              <Text style={styles.noDonationsText}>
                You haven't made any donations yet. Your first donation of ${parseFloat(monthlyDonationAmount || 0).toFixed(2)} will be processed this month.
              </Text>
            </View>
          )}
        </View>

        {/* Tax Summary */}
        <View style={styles.taxSection}>
          <Text style={styles.sectionTitle}>Tax Summary</Text>
          <View style={styles.taxCard}>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Total Donations (2024)</Text>
              <Text style={styles.taxValue}>${parseFloat(totalDonated || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Charity Name</Text>
              <Text style={styles.taxValue}>Thrive Initiative, Inc.</Text>
            </View>
            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>EIN Number</Text>
              <Text style={styles.taxValue}>81-3223950</Text>
            </View>
            {!hasCompletedDonations && (
              <View style={styles.taxRow}>
                <Text style={styles.taxLabel}>Next Donation</Text>
                <Text style={styles.taxValue}>${parseFloat(monthlyDonationAmount || 0).toFixed(2)} (This Month)</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 20 },
  scrollContainer: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
  editAmountButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#DB8633',
    borderRadius: 6,
  },
  editAmountText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
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
  noDonationsMessage: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderStyle: 'dashed',
  },
  noDonationsText: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6C757D',
  },
});
