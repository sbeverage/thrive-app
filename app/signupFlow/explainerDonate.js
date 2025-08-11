import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function ExplainerDonate() {
  const router = useRouter();

  const handleContinue = () => {
    router.push('/signupFlow/beneficiarySignupCause');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back Navigation */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      {/* Hero Section with Gradient */}
      <View style={styles.heroSection}>
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>

      {/* Main Content */}
      <View style={styles.contentSection}>
        <LinearGradient
          colors={["rgba(44, 62, 80, 0.05)", "rgba(76, 161, 175, 0.05)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.contentGradient}
        >
          {/* Nonprofit Badge */}
          <View style={styles.nonprofitBadge}>
            <AntDesign name="heart" size={16} color="#fff" />
            <Text style={styles.nonprofitText}>Nonprofit Organization</Text>
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
                  All proceeds go directly to your chosen beneficiary and our nonprofit organization
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
            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <Text style={styles.continueButtonText}>Choose Your Cause →</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  heroSection: {
    height: 160,
    position: 'relative',
  },
  gradientBg: {
    flex: 1,
  },
  contentSection: {
    marginTop: -50,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: 'transparent',
  },
  contentGradient: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  nonprofitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DB8633',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 24,
  },
  nonprofitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 34,
  },
  benefitsContainer: {
    marginBottom: 32,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8F9FA',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  benefitIcon: {
    backgroundColor: '#FFF5EB',
    borderRadius: 12,
    padding: 12,
    marginRight: 16,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#6C757D',
    lineHeight: 20,
  },
  ctaSection: {
    alignItems: 'center',
    marginTop: 16,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 20,
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
