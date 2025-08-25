import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { AntDesign, Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailCard({ data, onSelect, showBackArrow = true }) {
  const router = useRouter();
  const segments = useSegments();

  const [donation, setDonation] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [activeTab, setActiveTab] = useState('about');
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [liked, setLiked] = useState(false);

  const isSignupFlow = segments.includes('signupFlow');
  const presetAmounts = [5, 10, 15];

  const aboutPreview = data.about?.split(' ').slice(0, 60).join(' ') + '...';

  return (
    <ScrollView style={styles.containerNoFlex} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        {showBackArrow && (
        <TouchableOpacity onPress={router.back}>
          <AntDesign name="arrowleft" size={24} color="#21555b" />
        </TouchableOpacity>
        )}
      </View>

      {/* Image */}
      <View style={styles.imageCarousel}>
        <Image source={data.image} style={styles.mainImage} />
      </View>

      {/* Profile Info */}
      <View style={styles.profileRow}>
        <Image source={data.image} style={styles.profileImage} />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.title}>{data.name}</Text>
        <Text style={styles.likes}>500+ supporters</Text>
        <Text style={styles.mutual}>Join our community of changemakers</Text>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              if (isSignupFlow) {
                onSelect?.();
              }
            }}
          >
            <Image
              source={require('../assets/icons/donation-box.png')}
              style={[styles.iconLeft, { tintColor: '#fff' }]}
            />
            <Text style={styles.btnText}>
              Select This Cause
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setLiked(prev => !prev)}
          >
            <AntDesign
              name={liked ? 'heart' : 'hearto'}
              size={18}
              style={[styles.iconLeft, { color: liked ? '#DB8633' : '#666' }]}
            />
            <Text style={[styles.btnTextGray, liked && { color: '#DB8633' }]}>
              {liked ? 'Liked' : 'Favorite'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setActiveTab('about')}>
            <Text style={activeTab === 'about' ? styles.tabActive : styles.tabInactive}>
              About & Impact
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('volunteer')}>
            <Text style={activeTab === 'volunteer' ? styles.tabActive : styles.tabInactive}>
              Get Involved
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'about' ? (
          <>
            {/* Enhanced About Section */}
            <View style={styles.aboutSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.aboutText}>
                {showFullAbout ? data.about : aboutPreview}
                {!showFullAbout && (
                  <Text onPress={() => setShowFullAbout(true)} style={styles.readMore}>
                    {' '}Read More
                  </Text>
                )}
              </Text>
            </View>

            {/* Why This Matters Section */}
            <View style={styles.impactSection}>
              <Text style={styles.sectionTitle}>Why This Matters</Text>
              <Text style={styles.impactText}>
                Every donation directly supports families in need, providing immediate relief and long-term solutions. Your generosity creates real change in our community.
              </Text>
            </View>

            {/* Impact Metrics */}
            <View style={styles.metricsSection}>
              <Text style={styles.sectionTitle}>Our Impact</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <MaterialIcons name="people" size={24} color="#DB8633" />
                  <Text style={styles.metricNumber}>10,000+</Text>
                  <Text style={styles.metricLabel}>Families Helped</Text>
                </View>
                <View style={styles.metricCard}>
                  <MaterialIcons name="location-on" size={24} color="#DB8633" />
                  <Text style={styles.metricNumber}>25</Text>
                  <Text style={styles.metricLabel}>Communities Served</Text>
                </View>
                <View style={styles.metricCard}>
                  <MaterialIcons name="volunteer-activism" size={24} color="#DB8633" />
                  <Text style={styles.metricNumber}>95%</Text>
                  <Text style={styles.metricLabel}>Direct to Programs</Text>
                </View>
              </View>
            </View>

            {/* Success Story */}
            <View style={styles.storySection}>
              <Text style={styles.sectionTitle}>Success Story</Text>
              <View style={styles.storyCard}>
                <Text style={styles.storyText}>
                  "Thanks to generous donors like you, we were able to provide emergency housing for the Johnson family during their crisis. Your support makes these miracles possible." 
                </Text>
                <Text style={styles.storyAuthor}>- Sarah M., Program Director</Text>
              </View>
            </View>

            {/* Your Impact */}
            <View style={styles.yourImpactSection}>
              <Text style={styles.sectionTitle}>Your Impact</Text>
              <View style={styles.impactCard}>
                <MaterialIcons name="favorite" size={20} color="#DB8633" />
                <Text style={styles.impactText}>
                  Every $25 provides a family with essential supplies for one week
                </Text>
              </View>
              <View style={styles.impactCard}>
                <MaterialIcons name="home" size={20} color="#DB8633" />
                <Text style={styles.impactText}>
                  Every $100 helps provide emergency housing for families in crisis
                </Text>
              </View>
            </View>

            {/* Trust & Transparency */}
            <View style={styles.trustSection}>
              <Text style={styles.sectionTitle}>Trust & Transparency</Text>
              <View style={styles.trustRow}>
                <MaterialIcons name="verified" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>Verified 501(c)(3) Nonprofit</Text>
              </View>
              <View style={styles.trustRow}>
                <MaterialIcons name="account-balance" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>EIN: {data.ein}</Text>
              </View>
              <View style={styles.trustRow}>
                <MaterialIcons name="language" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>Website: {data.website}</Text>
              </View>
              <View style={styles.trustRow}>
                <MaterialIcons name="phone" size={20} color="#4CA1AF" />
                <Text style={styles.trustText}>Phone: {data.phone}</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.volunteerSection}>
            <Text style={styles.sectionTitle}>Get Involved</Text>
            <Text style={styles.volunteerText}>
              Beyond financial support, there are many ways to make a difference:
            </Text>
            <View style={styles.volunteerOptions}>
              <View style={styles.volunteerOption}>
                <MaterialIcons name="volunteer-activism" size={24} color="#DB8633" />
                <Text style={styles.volunteerOptionText}>Volunteer at events</Text>
              </View>
              <View style={styles.volunteerOption}>
                <MaterialIcons name="share" size={24} color="#DB8633" />
                <Text style={styles.volunteerOptionText}>Spread awareness</Text>
              </View>
              <View style={styles.volunteerOption}>
                <MaterialIcons name="groups" size={24} color="#DB8633" />
                <Text style={styles.volunteerOptionText}>Join committees</Text>
              </View>
            </View>
            <Text style={styles.volunteerNote}>
              Contact us to learn more about volunteer opportunities and how you can get involved in our mission.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerNoFlex: { 
    backgroundColor: '#fff',
    width: '100%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16 },
  header: { fontSize: 18, fontWeight: '600', marginLeft: 12, color: '#21555b' },
  imageCarousel: { width: '100%', height: 200 },
  mainImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: -40, marginLeft: 16 },
  profileImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff' },
  infoBox: { 
    paddingBottom: 20,
    width: '100%',
  },
  iconLeft: { width: 18, height: 18, marginRight: 8, resizeMode: 'contain' },
  likes: { 
    fontSize: 14, 
    color: '#666', 
    marginTop: 4,
    paddingLeft: 24,
  },
  mutual: { 
    fontSize: 12, 
    color: '#888', 
    marginVertical: 8,
    paddingLeft: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#DB8633',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  btnTextGray: { color: '#666', fontWeight: '600' },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#eee',
    paddingHorizontal: 24,
  },
  tabActive: {
    fontWeight: '700',
    color: '#DB8633',
    borderBottomWidth: 2,
    borderBottomColor: '#DB8633',
    paddingBottom: 4,
  },
  tabInactive: { color: '#999' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
    color: '#21555b',
  },
  aboutText: { fontSize: 14, color: '#444', lineHeight: 20 },
  readMore: { color: '#DB8633', fontWeight: '600' },
  label: { fontWeight: '600', color: '#21555b' },
  infoLine: { marginTop: 8, fontSize: 14 },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    alignItems: 'center',
  },
  viewAll: { color: '#DB8633', fontWeight: '600' },
  postCard: {
    width: screenWidth * 0.6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginRight: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  postImage: { width: '100%', height: 120, borderRadius: 8, marginBottom: 8 },
  postText: { fontSize: 14, color: '#333', marginBottom: 8 },
  iconRow: { flexDirection: 'row' },
  donationBox: {
    marginTop: 40,
    backgroundColor: '#324E58',
    borderRadius: 20,
    padding: 20,
  },
  sectionTitleWhite: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  donationInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  presetRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  presetButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DB8633',
  },
  presetSelected: { backgroundColor: '#DB8633' },
  presetText: { fontSize: 14, fontWeight: '600', color: '#DB8633' },
  donateBtn: {
    backgroundColor: '#89A6A6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  donateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  title: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#21555b', 
    marginTop: 8,
    paddingHorizontal: 24,
  },
  aboutSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  impactSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  impactText: { fontSize: 14, color: '#444', lineHeight: 20 },
  metricsSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  metricCard: {
    alignItems: 'center',
    width: screenWidth * 0.25,
    textAlign: 'center',
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DB8633',
    marginTop: 8,
    textAlign: 'center',
  },
  metricLabel: { 
    fontSize: 12, 
    color: '#666', 
    marginTop: 4,
    textAlign: 'center',
  },
  storySection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  storyCard: {
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  storyText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  storyAuthor: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
  },
  yourImpactSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
  },
  impactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  impactText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  trustSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
    marginBottom: 0,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  trustText: {
    fontSize: 14,
    color: '#4CA1AF',
    marginLeft: 8,
  },
  volunteerSection: { 
    marginTop: 24,
    paddingHorizontal: 24,
    marginBottom: 0,
  },
  volunteerText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  volunteerOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  volunteerOption: {
    alignItems: 'center',
  },
  volunteerOptionText: {
    fontSize: 12,
    color: '#DB8633',
    marginTop: 8,
  },
  volunteerNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 16,
    textAlign: 'center',
  },
});
