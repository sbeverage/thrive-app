import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import OneTimeDonationCard from './OneTimeDonationCard';

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetailCardApp({ data, onSelect }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('about');
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [liked, setLiked] = useState(false);

  const aboutPreview = data.about?.split(' ').slice(0, 35).join(' ') + '...';
  const posts = data.posts || [];

  return (
    <ScrollView style={styles.containerNoFlex} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={router.back}>
          <AntDesign name="left" size={24} color="#21555b" />
        </TouchableOpacity>
        <Text style={styles.header}>{data.name}</Text>
      </View>

      {/* Main Image */}
      <View style={styles.imageCarousel}>
        <Image source={data.image} style={styles.mainImage} />
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.title}>{data.name}</Text>
        <Text style={styles.likes}>500 likes</Text>
        <Text style={styles.mutual}>+20 others friends like this beneficiary</Text>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={onSelect}>
            <Image
              source={require('../assets/icons/donation-box.png')}
              style={[styles.iconLeft, { tintColor: '#fff' }]}
            />
            <Text style={styles.btnText}>Select This Cause</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setLiked(prev => !prev)}
          >
            <Image
              source={require('../assets/icons/heart.png')}
              style={[
                styles.iconLeft,
                {
                  width: 18,
                  height: 18,
                  tintColor: liked ? '#DB8633' : '#666'
                }
              ]}
            />
            <Text style={[styles.btnTextGray, liked && { color: '#DB8633' }]}>
              {liked ? 'Liked' : 'Like'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
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
        <Text style={styles.infoLine}><Text style={styles.label}>Instagram:</Text> {data.social}</Text>

        {/* Activity Posts */}
        {posts.length > 0 && (
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Activity</Text>
            <TouchableOpacity>
              <Text style={styles.viewAll}>View All Posts</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 30 }} 
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
      </View>

      {/* One-Time Donation Card with padding */}
      <View style={{ paddingHorizontal: 5, marginTop: -8 }}>
        <OneTimeDonationCard />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerNoFlex: { backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  header: { fontSize: 18, fontWeight: '600', marginLeft: 12, color: '#21555b' },
  imageCarousel: { width: '100%', height: 200 },
  mainImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  infoBox: { paddingHorizontal: 24, paddingBottom: 0 },
  iconLeft: { width: 18, height: 18, marginRight: 8, resizeMode: 'contain' },
  title: { fontSize: 20, fontWeight: '700', color: '#21555b', marginTop: 8 },
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
});
