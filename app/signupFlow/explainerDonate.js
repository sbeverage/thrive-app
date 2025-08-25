import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ExplainerDonate() {
  const router = useRouter();

  const handleContinue = () => {
    router.push('/signupFlow/beneficiarySignupCause');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Blue gradient as absolute background for top half */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>

      {/* Back Navigation */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      {/* Main Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentSection}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true}
      >
        <View style={styles.infoCard}>
          {/* Nonprofit Badge */}
          <View style={styles.nonprofitBadge}>
            <AntDesign name="heart" size={16} color="#fff" />
            <Text style={styles.nonprofitText}>Watch Video</Text>
          </View>

          {/* Main Headline */}
          <Text style={styles.headline}>
            Your Donation Makes a Difference
          </Text>

          {/* Key Benefits */}
          <View style={styles.benefitsContainer}>
            <View style={styles.benefitCard}>
              <View style={styles.benefitIcon}>
                <AntDesign name="gift" size={24} color="#DB8633" />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>100% to Charity</Text>
                <Text style={styles.benefitDescription}>
                  All proceeds go directly to our nonprofit organization and your chosen beneficiary
                </Text>
              </View>
            </View>

            <View style={styles.benefitCard}>
              <View style={styles.benefitIcon}>
                <AntDesign name="star" size={24} color="#DB8633" />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Local Discounts</Text>
                <Text style={styles.benefitDescription}>
                  Get exclusive discounts from amazing local partners as a thank you
                </Text>
              </View>
            </View>

            <View style={styles.benefitCard}>
              <View style={styles.benefitIcon}>
                <AntDesign name="checkcircle" size={24} color="#DB8633" />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Monthly Impact</Text>
                <Text style={styles.benefitDescription}>
                  Set up recurring donations to create lasting change
                </Text>
              </View>
            </View>
          </View>

          {/* Call to Action */}
          <View style={styles.ctaSection}>
            <Text style={styles.ctaText}>
              Ready to make a difference?
            </Text>
          </View>
          
          {/* Extra Content for Scrolling */}
          <View style={styles.extraContent}>
            <Text style={styles.extraText}>
              Join thousands of others making a positive impact in their communities every month.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Button at Bottom */}
      <View style={styles.stickyButtonContainer}>
        <View style={styles.buttonIndicator}>
          <Text style={styles.buttonIndicatorText}>Next Step</Text>
        </View>
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Choose Your Cause →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: SCREEN_HEIGHT * 0.45, 
    zIndex: 0, 
    overflow: 'hidden' 
  },
  gradientBg: { 
    width: SCREEN_WIDTH, 
    height: '100%', 
    borderBottomLeftRadius: 40, 
    borderBottomRightRadius: 40 
  },
  scrollView: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contentSection: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 50,
    paddingBottom: 140, // Increased to give more scrollable content
    zIndex: 5,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24, // Reduced from 28 to fit content better
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 10,
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nonprofitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DB8633',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 20,
  },
  nonprofitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headline: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1a202c', // Darker color for better contrast
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 32,
  },
  benefitsContainer: {
    marginBottom: 16, // Reduced to fit content better
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8, // Reduced from 12 to fit better
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    minHeight: 80,
  },
  benefitIcon: {
    backgroundColor: '#FFF5EB',
    borderRadius: 12,
    padding: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DB8633',
    width: 44, // Fixed width for icon container
    height: 44, // Fixed height for icon container
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0, // Ensure text can wrap properly
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a202c', // Darker color for better contrast
    marginBottom: 3,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#4a5568', // Darker color for better contrast
    lineHeight: 20,
  },
  ctaSection: {
    alignItems: 'center',
    marginTop: 8, // Reduced from 12 to fit better
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a202c',
    textAlign: 'center',
    marginBottom: 0,
  },
  extraContent: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  extraText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  stickyButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  buttonIndicator: {
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonIndicatorText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
