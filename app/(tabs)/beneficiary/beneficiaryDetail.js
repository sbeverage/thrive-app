// app/(tabs)/beneficiaryDetail.js
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
  Dimensions
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';

const screenWidth = Dimensions.get('window').width;

export default function BeneficiaryDetail() {
  const [donation, setDonation] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(null);

  const presetAmounts = [5, 10, 15];
  const posts = [
    { id: '1', image: require('../../../assets/images/child-cancer.jpg'), text: 'Lorem ipsum dolor sit amet...' },
    { id: '2', image: require('../../../assets/images/child-cancer.jpg'), text: 'Lorem ipsum dolor sit amet...' }
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity>
          <AntDesign name="arrowleft" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.header}>Beneficiaries Detail</Text>
      </View>

      {/* Carousel Placeholder */}
      <View style={styles.imageCarousel}>
        <Image source={require('../../../assets/images/child-cancer.jpg')} style={styles.mainImage} />
      </View>

      {/* Profile Row */}
      <View style={styles.profileRow}>
        <Image source={require('../../../assets/images/child-cancer.jpg')} style={styles.profileImage} />
        <TouchableOpacity style={styles.shareIcon}>
          <Feather name="share-2" size={20} color="#444" />
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.title}>WarAngel Farms</Text>
        <Text style={styles.likes}>500 likes</Text>
        <Text style={styles.mutual}>+20 others friends like this beneficiary</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryBtn}>
            <Text style={styles.btnText}>Select As My Beneficiary</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn}>
            <Text style={styles.btnTextGray}>Like Beneficiary</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          <Text style={styles.tabInactive}>Volunteer Opportunities</Text>
          <Text style={styles.tabActive}>About Beneficiary</Text>
        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.aboutText}>
          We are a 501c3 Non-Profit Animal Rescue based on 100 acres in Canton, Ga...
        </Text>

        <Text style={styles.infoLine}><Text style={styles.label}>EIN:</Text> 81-3223950</Text>
        <Text style={styles.infoLine}><Text style={styles.label}>Website:</Text> warangelfarms.com</Text>
        <Text style={styles.infoLine}><Text style={styles.label}>Phone:</Text> 770-317-8476</Text>
        <Text style={styles.infoLine}><Text style={styles.label}>Social Media:</Text> @warangelfarms</Text>

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

        <View style={styles.donationBox}>
          <Text style={styles.sectionTitleWhite}>Give a one-time donation</Text>
          <TextInput
            placeholder="Enter amount"
            placeholderTextColor="#ccc"
            keyboardType="numeric"
            value={donation}
            onChangeText={setDonation}
            style={styles.donationInput}
          />
          <View style={styles.presetRow}>
            {presetAmounts.map(amount => (
              <TouchableOpacity
                key={amount}
                style={[styles.presetButton, selectedAmount === amount && styles.presetSelected]}
                onPress={() => {
                  setDonation(String(amount));
                  setSelectedAmount(amount);
                }}
              >
                <Text style={styles.presetText}>${amount}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.donateBtn}>
            <Text style={styles.donateBtnText}>Send Onetime Gift</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  header: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  imageCarousel: {
    width: '100%',
    height: 200,
  },
  mainImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -40,
    marginLeft: 16,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
  },
  shareIcon: {
    marginLeft: 'auto',
    marginRight: 24,
  },
  infoBox: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginTop: 8,
  },
  likes: { fontSize: 14, color: '#666', marginTop: 4 },
  mutual: { fontSize: 12, color: '#888', marginVertical: 8 },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#DB8633',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#F2F2F5',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
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
  },
  aboutText: { fontSize: 14, color: '#444', lineHeight: 20 },
  label: { fontWeight: '600', color: '#324E58' },
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
  postImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
  },
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
  presetSelected: {
    backgroundColor: '#DB8633',
  },
  presetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
  },
  donateBtn: {
    backgroundColor: '#89A6A6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  donateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
