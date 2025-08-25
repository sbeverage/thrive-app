// File: app/guestHome.js

import React from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Tabs } from 'expo-router';
import MonthlyImpactCard from '../components/MonthlyImpactCard';

export default function MainHome() {
  const router = useRouter();
  const monthlyDonation = 15;
  const monthlySavings = 0;

  let [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_700Bold,
  });

  if (!fontsLoaded) return null;

  const vouchers = [
    { id: '1', brandName: 'Starbucks', logo: require('../assets/logos/starbucks.png'), discounts: 3, category: 'Coffee Shop' },
    { id: '2', brandName: 'Ceviche', logo: require('../assets/images/ceviche-logo.png'), discounts: 2, category: 'Restaurants' },
    { id: '3', brandName: 'Amazon', logo: require('../assets/logos/amazon.png'), discounts: 3, category: 'Shopping Store' },
  ];

  const handleNavigate = () => {
    router.push('/signupFlow/beneficiarySignupCause');
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <LinearGradient
            colors={['#2C3E50', '#4CA1AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerWrapper}
          >
            <View style={styles.headerTopRow}>
              <Image source={require('../assets/logos/thrive-logo-white.png')} style={styles.logo} resizeMode="contain" />
              <View style={styles.rightIcons}>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/menu/notifications')}>
                  <Image source={require('../assets/icons/notification.png')} style={styles.iconWhite} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/menu')}>
                  <Image source={require('../assets/icons/menu.png')} style={styles.iconWhite} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.profileRow}>
              <View style={styles.profileLeft}>
                <Image source={require('../assets/images/profile.jpg')} style={styles.profilePic} />
                <Text style={styles.greetingText}>Hey Stephanie!</Text>
              </View>
              <View style={styles.coinsContainer}>
                <Image source={require('../assets/icons/coin.png')} style={{ width: 18, height: 18, marginRight: 6 }} />
                <Text style={styles.coinsText}>25</Text>
              </View>
            </View>

            <Text style={styles.affirmationText}>“You're someone’s reason to smile today!”</Text>
            <Text style={styles.locationText}>Home — Alpharetta, GA, USA</Text>
          </LinearGradient>

          {/* Monthly Impact Card */}
          <View style={styles.monthlyCardWrapper}>
            <MonthlyImpactCard monthlyDonation={monthlyDonation} monthlySavings={monthlySavings} />
          </View>

          {/* My Beneficiary */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Beneficiary</Text>
          </View>
          <View style={{ backgroundColor: '#F5F5FA', marginHorizontal: 20, borderRadius: 8, padding: 16, marginBottom: 10 }}>
            <Text style={{ textAlign: 'center', color: '#6B7280' }}>No beneficiary selected yet</Text>
          </View>
          <TouchableOpacity
            onPress={handleNavigate}
            style={{ marginHorizontal: 20, borderColor: '#DB8633', borderWidth: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#DB8633', fontWeight: '600' }}>Select This Cause</Text>
          </TouchableOpacity>

          {/* Discounts Near You */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discounts Near You</Text>
          </View>
          <View style={{ backgroundColor: '#F5F5FA', marginHorizontal: 20, borderRadius: 8, padding: 16, marginBottom: 10 }}>
            <Text style={{ textAlign: 'center', color: '#6B7280' }}>No beneficiary selected yet</Text>
          </View>
          <TouchableOpacity
            onPress={handleNavigate}
            style={{ marginHorizontal: 20, borderColor: '#DB8633', borderWidth: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#DB8633', fontWeight: '600' }}>Change Location</Text>
          </TouchableOpacity>

          {/* Rank */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Rank</Text>
            <TouchableOpacity onPress={() => router.push('/leaderboard')}>
              <Text style={styles.viewDetailsText}>View Leaderboard</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>Coming Soon</Text>
          </View>

          {/* Invite A Friend - Fixed Layout */}
          <View style={styles.inviteBannerWrapper}>
            <View style={styles.inviteInnerWrapper}>
              <View style={styles.inviteImageContainer}>
                <Image source={require('../assets/images/invite-kids.png')} style={styles.inviteBannerImage} />
              </View>
              <View style={styles.inviteTextBlock}>
                <Text style={styles.inviteBannerHeadline}>
                  Together we can do more! – share the love.
                </Text>
                <TouchableOpacity style={styles.inviteBannerButton}>
                  <Text style={styles.inviteBannerButtonText}>Invite A Friend</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <Tabs />
    </>
  );
}
