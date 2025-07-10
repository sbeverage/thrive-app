import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
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
  const posts = [
    { id: '1', image: data.image, text: 'Lorem ipsum dolor sit amet...' },
    { id: '2', image: data.image, text: 'Lorem ipsum dolor sit amet...' },
  ];

  const aboutPreview = data.about?.split(' ').slice(0, 35).join(' ') + '...';

  return (
    <ScrollView style={styles.containerNoFlex} contentContainerStyle={{ paddingBottom: 40 }}>
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
        <Text style={styles.likes}>500 likes</Text>
        <Text style={styles.mutual}>+20 others friends like this beneficiary</Text>

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
              {isSignupFlow ? 'Select to Donate' : 'Select As My Beneficiary'}
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
              About Beneficiary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('volunteer')}>
            <Text style={activeTab === 'volunteer' ? styles.tabActive : styles.tabInactive}>
              Volunteer Opportunities
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'about' ? (
          <>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.aboutText}>
              {showFullAbout ? data.about : aboutPreview}
              {!showFullAbout && (
                <Text onPress={() => setShowFullAbout(true)} style={styles.readMore}>
                  {' '}Read More
                </Text>
              )}
            </Text>

            <Text style={styles.infoLine}><Text style={styles.label}>EIN:</Text> {data.ein}</Text>
            <Text style={styles.infoLine}><Text style={styles.label}>Website:</Text> {data.website}</Text>
            <Text style={styles.infoLine}><Text style={styles.label}>Phone:</Text> {data.phone}</Text>
            <Text style={styles.infoLine}><Text style={styles.label}>Social Media:</Text> {data.social}</Text>

            <View style={styles.activityHeader}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <TouchableOpacity>
                <Text style={styles.viewAll}>View All Posts</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={posts}
              keyExtractor={item => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.postCard}>
                  <Image source={item.image} style={styles.postImage} />
                  <Text style={styles.postText}>{item.text}</Text>
                  <View style={styles.iconRow}>
                    <Feather name="repeat" size={18} color="#324E58" />
                    <Feather name="share-2" size={18} color="#324E58" style={{ marginLeft: 16 }} />
                  </View>
                </View>
              )}
            />
          </>
        ) : (
          <Text style={{ color: '#888', fontSize: 16, marginTop: 24, textAlign: 'center' }}>
            Volunteer opportunities coming soon.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerNoFlex: { backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16 },
  header: { fontSize: 18, fontWeight: '600', marginLeft: 12, color: '#21555b' },
  imageCarousel: { width: '100%', height: 200 },
  mainImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: -40, marginLeft: 16 },
  profileImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff' },
  infoBox: { paddingHorizontal: 24, paddingBottom: 120 },
  iconLeft: { width: 18, height: 18, marginRight: 8, resizeMode: 'contain' },
  likes: { fontSize: 14, color: '#666', marginTop: 4 },
  mutual: { fontSize: 12, color: '#888', marginVertical: 8 },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
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
  title: { fontSize: 20, fontWeight: '700', color: '#21555b', marginTop: 8 },
});
