// file: app/(tabs)/home.js
import React, { useEffect, useState } from 'react';
import { useFonts, Figtree_400Regular, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Image, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Tabs, useFocusEffect } from 'expo-router';
import MonthlyImpactCard from '../../components/MonthlyImpactCard';
import { useBeneficiary } from '../context/BeneficiaryContext';
import { useUser } from '../context/UserContext';
import API from '../lib/api';

export default function MainHome() {
  const router = useRouter();
  const { selectedBeneficiary } = useBeneficiary();
  const { user, saveUserData, loadUserData, syncWithBackend, clearAllData, clearProfileImage, addPoints, addSavings, uploadProfilePicture, checkVerificationStatus } = useUser();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // Calculate monthly values based on user's donation amount
  const monthlyDonation = user.monthlyDonation || 15;
  const monthlySavings = user.totalSavings || 0; // Use total savings from discounts
  
  // Debug the values being passed to the card
  console.log('🏠 Monthly card values:', { monthlyDonation, monthlySavings, userMonthlyDonation: user.monthlyDonation });

  // Debug user data
  console.log('🏠 Home page - User data:', user);
  console.log('🏠 Home page - First name:', user.firstName);
  console.log('🏠 Home page - Last name:', user.lastName);
  console.log('🏠 Home page - Profile image:', user.profileImage);
  console.log('🏠 Home page - Profile image URL:', user.profileImageUrl);
  console.log('🏠 Home page - Image type:', typeof user.profileImage);
  console.log('🏠 Home page - Is verified:', user.isVerified);

  // Force re-render when user data changes
  useEffect(() => {
    console.log('🔄 Home page user data changed:', user);
  }, [user, refreshTrigger]);

  // Load user data when home page loads
  useEffect(() => {
    console.log('🏠 Home page useEffect - loading user data...');
    const loadData = async () => {
      const loadedData = await loadUserData();
      console.log('🏠 Loaded data result:', loadedData);
      // Force a re-render after loading data
      setRefreshTrigger(prev => prev + 1);
    };
    loadData();
  }, []);

  // Refresh data when user navigates to home page
  useFocusEffect(
    React.useCallback(() => {
      console.log('🏠 Home page focused - refreshing user data...');
      const refreshData = async () => {
        const loadedData = await loadUserData();
        console.log('🏠 Focus refresh - loaded data:', loadedData);
        setRefreshTrigger(prev => prev + 1);
      };
      refreshData();
    }, [])
  );

  // Debug user data changes
  useEffect(() => {
    console.log('🔄 User data changed:', {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profileImage: user.profileImage,
      isLoading: user.isLoading
    });
  }, [user]);

  const handleTestBackend = async () => {
    console.log('🧪 Test button clicked!');
    console.log('Starting backend test...');
    Alert.alert('Debug', 'Button clicked! Check console for logs.');
    
    try {
      console.log('Fetching backend...');
      Alert.alert('Testing Backend', 'Testing connection to your backend...');
      
      // Test basic connectivity to your backend
      const response = await fetch('http://thrive-backend-final.eba-fxvg5pyf.us-east-1.elasticbeanstalk.com/api/health');
      console.log('Response received:', response.status);
      
      if (response.ok) {
        console.log('✅ Backend test successful!');
        Alert.alert('✅ Success!', 'Backend connection is working perfectly!');
      } else {
        console.log('⚠️ Backend returned status:', response.status);
        Alert.alert('⚠️ Partial Success', 'Backend is reachable but some endpoints may have issues.');
      }
    } catch (error) {
      console.log('❌ Backend test failed:', error);
      Alert.alert('❌ Test Failed', `Backend connection test failed: ${error.message}`);
      console.error('Test error:', error);
    }
  };

  const handleTestSignup = async () => {
    try {
      Alert.alert('Testing Signup', 'Testing signup API call...');
      const response = await API.signup({ 
        email: 'test@example.com', 
        password: 'testpassword123' 
      });
      Alert.alert('✅ Signup Test Success', 'Signup API is working!');
    } catch (error) {
      Alert.alert('❌ Signup Test Failed', `Error: ${error.message}\n\nThis might be a network issue or backend problem.`);
      console.error('Signup test error:', error);
    }
  };

  const handleSyncWithBackend = async () => {
    try {
      Alert.alert('Syncing', 'Syncing user data with backend...');
      await syncWithBackend();
      Alert.alert('✅ Sync Complete', 'User data synced with backend successfully!');
    } catch (error) {
      Alert.alert('❌ Sync Failed', `Error: ${error.message}`);
      console.error('Sync error:', error);
    }
  };

  const handleDeleteUser = async () => {
    Alert.alert(
      'Delete User Account',
      'Enter email to delete from database:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          onPress: async () => {
            try {
              await API.deleteUser('stephanie@phixsolutions.com');
              Alert.alert('✅ User Deleted', 'User account deleted from database. You can now sign up again.');
            } catch (error) {
              Alert.alert('❌ Delete Failed', `Error: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  const handleTestSavings = async () => {
    try {
      await addSavings(5.50); // Add $5.50 to test
      Alert.alert('✅ Test Savings Added', 'Added $5.50 to your savings!');
    } catch (error) {
      Alert.alert('❌ Test Failed', `Error: ${error.message}`);
    }
  };

  const handleTestS3Upload = async () => {
    try {
      console.log('📸 Testing S3 image upload...');
      
      // Test with a dummy image URI (you can replace this with actual image picker)
      const testImageUri = 'file:///test/image.jpg';
      
      const result = await uploadProfilePicture(testImageUri);
      console.log('✅ S3 image upload test result:', result);
      
      Alert.alert('S3 Test Result', `Image upload to S3 completed. Check console for details.`);
    } catch (error) {
      console.error('❌ S3 image upload test failed:', error);
      Alert.alert('S3 Test Failed', `Image upload to S3 failed: ${error.message}`);
    }
  };

  const handleDebugUserData = () => {
    console.log('👤 Debug User Data:', user);
    Alert.alert(
      '👤 User Data Debug', 
      `Name: ${user.firstName || 'EMPTY'} ${user.lastName || 'EMPTY'}\nEmail: ${user.email || 'EMPTY'}\nProfile Image: ${user.profileImage ? 'Set' : 'Not set'}\nTotal Savings: $${user.totalSavings || 0}\n\nRaw data: ${JSON.stringify(user, null, 2)}`,
      [
        { text: 'Test Save Data', onPress: async () => {
          // Test saving some data
          await saveUserData({ firstName: 'Test', lastName: 'User' });
          Alert.alert('✅ Test Data Saved', 'Check if name changes to "Test User"');
        }},
        { text: 'Test Savings +$5.50', onPress: handleTestSavings},
        { text: 'Test S3 Upload', onPress: handleTestS3Upload},
        { text: 'Check Verification Status', onPress: checkVerificationStatus},
        { text: 'Test Image Upload', onPress: async () => {
          // Test with a sample image URI
          const testImageUri = 'https://via.placeholder.com/150x150/DB8633/FFFFFF?text=TEST';
          try {
            await uploadProfilePicture(testImageUri);
            Alert.alert('✅ Test Image Uploaded', 'Check if test image appears');
          } catch (error) {
            Alert.alert('❌ Image Upload Failed', error.message);
          }
        }},
        { text: 'Clear All Data', onPress: () => {
          clearAllData();
          Alert.alert('✅ Data Cleared', 'All user data has been cleared. Please restart the app.');
        }},
        { text: 'Clear Profile Image', onPress: () => {
          clearProfileImage();
          Alert.alert('✅ Image Cleared', 'Profile image cleared from local storage.');
        }},
        { text: 'Sync Backend', onPress: handleSyncWithBackend},
        { text: 'Delete User', onPress: handleDeleteUser, style: 'destructive'},
        { text: 'OK' }
      ]
    );
  };

  let [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_700Bold,
  });

  if (!fontsLoaded) return null;

  const vouchers = [
    { id: '1', brandName: 'Starbucks', logo: require('../../assets/logos/starbucks.png'), discounts: 3, category: 'Coffee Shop' },
    { id: '2', brandName: 'Ceviche', logo: require('../../assets/images/ceviche-logo.png'), discounts: 2, category: 'Restaurants' },
    { id: '3', brandName: 'Amazon', logo: require('../../assets/logos/amazon.png'), discounts: 3, category: 'Shopping Store' },
  ];

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Email Verification Banner */}
          {user.isLoggedIn && !user.isVerified && (
            <View style={styles.verificationBanner}>
              <Text style={styles.verificationText}>
                📧 Please verify your email to access all features
              </Text>
              <TouchableOpacity 
                style={styles.verifyButton}
                onPress={() => router.push('/verifyEmail')}
              >
                <Text style={styles.verifyButtonText}>Verify Email</Text>
              </TouchableOpacity>
            </View>
          )}
          
          <LinearGradient
            colors={['#2C3E50', '#4CA1AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerWrapper}
          >
            <View style={styles.headerTopRow}>
              <Image source={require('../../assets/logos/thrive-logo-white.png')} style={styles.logo} resizeMode="contain" />
              <View style={styles.rightIcons}>
                <TouchableOpacity style={styles.iconButton} onPress={handleTestBackend}>
                  <Text style={styles.testButtonText}>🧪</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={handleTestSignup}>
                  <Text style={styles.testButtonText}>S</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={handleDebugUserData}>
                  <Text style={styles.testButtonText}>👤</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={async () => {
                  try {
                    console.log('🧪 Testing saveUserData...');
                    const result = await saveUserData({ firstName: 'Test', lastName: 'User' });
                    console.log('✅ saveUserData result:', result);
                    setRefreshTrigger(prev => prev + 1);
                    Alert.alert('✅ Test Data Saved', `Name should change to "Test User". Result: ${JSON.stringify(result)}`);
                  } catch (error) {
                    console.error('❌ saveUserData error:', error);
                    Alert.alert('❌ Test Failed', `Error: ${error.message}`);
                  }
                }}>
                  <Text style={styles.testButtonText}>T</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={async () => {
                  console.log('🔄 Refreshing user data...');
                  const loadedData = await loadUserData();
                  console.log('🔄 Loaded data:', loadedData);
                  setRefreshTrigger(prev => prev + 1);
                  Alert.alert('🔄 Refreshed', `Page should refresh. Loaded: ${JSON.stringify(loadedData)}`);
                }}>
                  <Text style={styles.testButtonText}>R</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/menu')}>
                  <Image source={require('../../assets/icons/menu.png')} style={styles.iconWhite} />
                </TouchableOpacity>
              </View>
            </View>
            {/* Debug: User data display */}
            <Text style={{color: 'white', fontSize: 12, textAlign: 'center'}}>
              DEBUG: Name={user.firstName || 'EMPTY'} | Image={user.profileImage ? 'SET' : 'NOT SET'}
            </Text>

            <View style={styles.profileRow}>
              <View style={styles.profileLeft}>
                {user.profileImage ? (
                  <Image source={{ uri: user.profileImage }} style={styles.profilePic} />
                ) : user.firstName && user.lastName ? (
                  <View style={[styles.profilePic, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                      {user.firstName[0]}{user.lastName[0]}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.profilePic, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>
                      {user.firstName && user.lastName ? `${user.firstName[0]}${user.lastName[0]}` : '??'}
                    </Text>
                  </View>
                )}
                <Text style={styles.greetingText}>
                  Hey {user.firstName || 'there'}!
                </Text>
              </View>
              <View style={styles.coinsContainer}>
                <Image source={require('../../assets/icons/coin.png')} style={{ width: 18, height: 18, marginRight: 6 }} />
                <Text style={styles.coinsText}>{user.points || 0}</Text>
              </View>
            </View>

            <Text style={styles.affirmationText}>“You're someone’s reason to smile today!”</Text>
            <Text style={styles.locationText}>Home — Alpharetta, GA, USA</Text>
          </LinearGradient>

          <View style={styles.monthlyCardWrapper}>
            <MonthlyImpactCard 
              key={`${monthlyDonation}-${monthlySavings}`}
              monthlyDonation={monthlyDonation} 
              monthlySavings={monthlySavings} 
            />
          </View>

          {/* My Beneficiary Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>My Beneficiary</Text>
          </View>
          {selectedBeneficiary ? (
            <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary/beneficiaryDetail')} style={styles.beneficiaryCard}>
              <Image source={selectedBeneficiary.image} style={styles.beneficiaryImage} />
              <View style={styles.beneficiaryOverlay}>
                <Text style={styles.beneficiaryName}>{selectedBeneficiary.name}</Text>
                <Text style={styles.beneficiaryDesc}>{selectedBeneficiary.about}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary')} style={styles.beneficiaryCard}>
              <Image source={require('../../assets/images/child-cancer.jpg')} style={styles.beneficiaryImage} />
              <View style={styles.beneficiaryOverlay}>
                <Text style={styles.beneficiaryName}>Select Your Cause</Text>
                <Text style={styles.beneficiaryDesc}>Choose a beneficiary to support during your signup.</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Discounts Near You Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Discounts Near You</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discountScroll} contentContainerStyle={styles.discountScrollContent}>
            {vouchers.map((voucher, index) => (
              <View key={voucher.id} style={styles.discountCardWrapper}>
                <TouchableOpacity onPress={() => index === 0 && router.push(`/discounts/${voucher.id}`)}>
                  <View style={styles.cardCream}>
                    <Image source={voucher.logo} style={styles.discountLogo} resizeMode="contain" />
                    <Text style={styles.discountBrand}>{voucher.brandName}</Text>
                    <Text style={styles.discountCategory}>{voucher.category}</Text>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>{voucher.discounts} discounts</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Rank Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Rank</Text>
          </View>
          <View style={[styles.leaderboardItem, styles.yourRankingCard, { marginHorizontal: 20, marginBottom: 30 }]}>
            <View style={styles.leaderboardRankBox}>
              <Text style={[styles.leaderboardRank, styles.leaderboardRankYou]}>42</Text>
            </View>
            {user.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.leaderboardProfile} />
            ) : user.firstName && user.lastName ? (
              <View style={[styles.leaderboardProfile, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                  {user.firstName[0]}{user.lastName[0]}
                </Text>
              </View>
            ) : (
              <View style={[styles.leaderboardProfile, { backgroundColor: '#DB8633', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>
                  {user.firstName && user.lastName ? `${user.firstName[0]}${user.lastName[0]}` : '??'}
                </Text>
              </View>
            )}
            <View style={styles.leaderboardInfo}>
              <Text style={styles.leaderboardName}>
                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'Stephanie Beverage'}
              </Text>
              <Text style={styles.leaderboardLocation}>Alpharetta, GA</Text>
            </View>
          </View>

          {/* Divider below Rank */}
          <View style={{ height: 1, backgroundColor: '#E5E7EB', opacity: 0.7, marginVertical: 8, width: '100%' }} />

          {/* Enhanced Invite Section */}
          <View style={styles.inviteSectionWrapper}>
            <View style={styles.inviteSectionHeader}>
              <Text style={styles.inviteSectionTitle}>Grow Your Impact</Text>
              <Text style={styles.inviteSectionSubtitle}>Invite friends and earn rewards together</Text>
            </View>
            
            <View style={styles.inviteCard}>
              <View style={styles.inviteStatsContainer}>
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>3</Text>
                  <Text style={styles.inviteStatLabel}>Friends Invited</Text>
                </View>
                <View style={styles.inviteStatDivider} />
                <View style={styles.inviteStatItem}>
                  <Text style={styles.inviteStatNumber}>+150</Text>
                  <Text style={styles.inviteStatLabel}>Points Earned</Text>
                </View>
              </View>
              
              <View style={styles.inviteProgressContainer}>
                <Text style={styles.inviteProgressText}>Next milestone: 5 friends</Text>
                <View style={styles.inviteProgressBar}>
                  <View style={[styles.inviteProgressFill, { width: '60%' }]} />
                </View>
                <Text style={styles.inviteProgressReward}>🎁 +25 bonus points</Text>
              </View>
              
              <TouchableOpacity style={styles.inviteCardButton}>
                <Text style={styles.inviteCardButtonText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inviteSocialProof}>
              <Text style={styles.inviteSocialProofText}>
                "My friends love the discounts and we're all making a difference together!" 
                <Text style={styles.inviteSocialProofAuthor}> — Sarah M.</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <Tabs />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F5' },
  scrollContent: { paddingBottom: 20, backgroundColor: '#F5F5F5' },
  headerWrapper: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 130, height: 40 },
  rightIcons: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { marginLeft: 12 },
  iconWhite: { width: 22, height: 22, resizeMode: 'contain', tintColor: 'white' },
  profileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25 },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  profilePic: { width: 50, height: 50, borderRadius: 25 },
  greetingText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginLeft: 10 },
  coinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  coinsText: { fontSize: 14, color: '#324E58', fontWeight: '700' },
  affirmationText: { fontSize: 16, color: '#E5E8EA', fontStyle: 'italic', marginTop: 12 },
  locationText: { fontSize: 14, color: '#C7D0D8', marginTop: 6, marginBottom: 80 },
  monthlyCardWrapper: { marginTop: -90, marginHorizontal: 20, zIndex: 10 },
  sectionHeader: { fontSize: 20, fontWeight: '700', color: '#324E58' },
  sectionHeaderRow: { marginTop: 30, marginBottom: 10, paddingHorizontal: 20 },
  viewDetailsText: { fontSize: 14, fontWeight: '700', color: '#DB8633' },
  beneficiaryCard: {
    backgroundColor: '#F4F6F8',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    marginHorizontal: 20,
  },
  beneficiaryImage: { width: '100%', height: 200 },
  beneficiaryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 10,
  },
  beneficiaryName: { fontSize: 18, fontWeight: '700', color: '#324E58' },
  beneficiaryDesc: { fontSize: 14, color: '#7A8D9C', marginTop: 5 },
  discountScroll: { marginBottom: 10 },
  discountScrollContent: { paddingLeft: 20, paddingBottom: 10 },
  discountCardWrapper: { marginRight: 15 },
  cardCream: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    width: 160,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  discountLogo: { width: 40, height: 40, marginBottom: 6 },
  discountBrand: { fontSize: 16, fontWeight: '700', color: '#324E58' },
  discountCategory: { fontSize: 12, color: '#7A8D9C', marginTop: 2 },
  discountBadge: {
    backgroundColor: '#DB8633',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  discountBadgeText: { color: 'white', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  placeholderBox: {
    backgroundColor: '#F4F6F8',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
    marginHorizontal: 20,
  },
  placeholderText: { fontSize: 16, color: '#A0AAB7' },

  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  yourRankingCard: {
    borderWidth: 2,
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  leaderboardRankBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardRank: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B0B0B0',
  },
  leaderboardRankYou: {
    color: '#DB8633',
  },
  leaderboardProfile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
  },
  leaderboardLocation: {
    fontSize: 13,
    color: '#888',
  },
  leaderboardPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leaderboardPoints: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DB8633',
  },
  leaderboardCoin: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  inviteSectionWrapper: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 40,
    backgroundColor: '#F4F6F8',
    padding: 20,
  },
  inviteSectionHeader: {
    alignItems: 'center',
    marginBottom: 15,
  },
  inviteSectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 5,
  },
  inviteSectionSubtitle: {
    fontSize: 16,
    color: '#7A8D9C',
    textAlign: 'center',
  },
  inviteCard: {
    alignItems: 'center',
    marginBottom: 20,
  },
  inviteStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  inviteStatItem: {
    alignItems: 'center',
  },
  inviteStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
  },
  inviteStatLabel: {
    fontSize: 14,
    color: '#7A8D9C',
    marginTop: 5,
  },
  inviteStatDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E5E7EB',
    marginHorizontal: 20,
  },
  inviteProgressContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  inviteProgressText: {
    fontSize: 14,
    color: '#7A8D9C',
    marginBottom: 5,
  },
  inviteProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  inviteProgressFill: {
    height: '100%',
    backgroundColor: '#DB8633',
    borderRadius: 4,
  },
  inviteProgressReward: {
    fontSize: 14,
    color: '#DB8633',
    fontWeight: '700',
    marginTop: 5,
  },

  inviteCardButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginTop: 15,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  inviteCardButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  inviteSocialProof: {
    backgroundColor: '#F0F2F5',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
  },
  inviteSocialProofText: {
    fontSize: 14,
    color: '#324E58',
    lineHeight: 20,
  },
  inviteSocialProofAuthor: {
    fontWeight: '700',
    color: '#DB8633',
  },
  testButtonText: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
  },
  verificationBanner: {
    backgroundColor: '#FF6B6B',
    padding: 15,
    margin: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verificationText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  verifyButton: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 10,
  },
  verifyButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '700',
  },
});
