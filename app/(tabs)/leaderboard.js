import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const COIN_ICON = require('../../assets/icons/coin.png'); // Use your gold coin icon asset
const CROWN_ICON = require('../../assets/icons/crown.png'); // Use your crown icon asset

export default function LeaderboardScreen() {
  const router = useRouter();
  const [segment, setSegment] = useState('Global');

  // Example data for each segment (for now, all the same)
  const allWinners = [
    {
      id: 1,
      name: 'Sarah Johnson',
      city: 'Atlanta, GA',
      points: 800,
      rank: 2,
      profileImage: require('../../assets/images/profile.jpg'),
    },
    {
      id: 2,
      name: 'Michael Johnson',
      city: 'New York, NY',
      points: 1000,
      rank: 1,
      profileImage: require('../../assets/images/profile.jpg'),
    },
    {
      id: 3,
      name: 'Jennifer Parker',
      city: 'Los Angeles, CA',
      points: 700,
      rank: 3,
      profileImage: require('../../assets/images/profile.jpg'),
    },
  ];

  // Sort so 1st place is in the middle
  const sortedWinners = [allWinners[0], allWinners[1], allWinners[2]].sort((a, b) => a.rank - b.rank);

  // Top 10 winners data (replace with real data as needed)
  const top10 = [
    { id: 1, name: 'Michael Johnson', city: 'New York, NY', points: 1000, profileImage: require('../../assets/images/profile.jpg') },
    { id: 2, name: 'Sarah Johnson', city: 'Atlanta, GA', points: 800, profileImage: require('../../assets/images/profile.jpg') },
    { id: 3, name: 'Jennifer Parker', city: 'Los Angeles, CA', points: 700, profileImage: require('../../assets/images/profile.jpg') },
    { id: 4, name: 'David Thompson', city: 'Austin, TX', points: 650, profileImage: require('../../assets/images/profile.jpg') },
    { id: 5, name: 'Lisa Wang', city: 'Seattle, WA', points: 600, profileImage: require('../../assets/images/profile.jpg') },
    { id: 6, name: 'James Wilson', city: 'Denver, CO', points: 580, profileImage: require('../../assets/images/profile.jpg') },
    { id: 7, name: 'Maria Garcia', city: 'Phoenix, AZ', points: 570, profileImage: require('../../assets/images/profile.jpg') },
    { id: 8, name: 'Robert Kim', city: 'Portland, OR', points: 560, profileImage: require('../../assets/images/profile.jpg') },
    { id: 9, name: 'Jennifer Lee', city: 'Nashville, TN', points: 550, profileImage: require('../../assets/images/profile.jpg') },
    { id: 10, name: 'Christopher Brown', city: 'Charlotte, NC', points: 540, profileImage: require('../../assets/images/profile.jpg') },
  ];

  // Segmented control handler (for now, just keeps the same data)
  const handleSegment = (type) => setSegment(type);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Blue Gradient Header with Top 3 Winners */}
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <AntDesign name="arrowleft" size={24} color="#fff" />
      </TouchableOpacity>
            {/* Removed Leaderboard title and share icon */}
          </View>

          {/* Top 3 Winners Arc Layout */}
          <View style={styles.arcRow}>
            {/* 2nd Place - left */}
            <View style={[styles.arcCol, styles.arcSecond]}>
              <View style={[styles.arcCircle, styles.arcCircleSecond]}>
                {/* Crown icon removed */}
                <Image source={sortedWinners[1].profileImage} style={styles.arcImage} />
              </View>
              <Text style={styles.arcName}>{sortedWinners[1].name}</Text>
              <Text style={styles.arcLocation}>{sortedWinners[1].city}</Text>
              <View style={styles.arcPointsRow}>
                <Text style={styles.arcPoints}>{sortedWinners[1].points}</Text>
                <Image source={COIN_ICON} style={styles.arcCoin} />
              </View>
            </View>
            {/* 1st Place - center */}
            <View style={[styles.arcCol, styles.arcFirst]}>
              <View style={[styles.arcCircle, styles.arcCircleFirst]}>
                {/* Crown icon removed */}
                <Image source={sortedWinners[0].profileImage} style={styles.arcImageFirst} />
              </View>
              <Text style={styles.arcName}>{sortedWinners[0].name}</Text>
              <Text style={styles.arcLocation}>{sortedWinners[0].city}</Text>
              <View style={styles.arcPointsRow}>
                <Text style={styles.arcPoints}>{sortedWinners[0].points}</Text>
                <Image source={COIN_ICON} style={styles.arcCoin} />
              </View>
            </View>
            {/* 3rd Place - right */}
            <View style={[styles.arcCol, styles.arcThird]}>
              <View style={[styles.arcCircle, styles.arcCircleThird]}>
                {/* Crown icon removed */}
                <Image source={sortedWinners[2].profileImage} style={styles.arcImage} />
              </View>
              <Text style={styles.arcName}>{sortedWinners[2].name}</Text>
              <Text style={styles.arcLocation}>{sortedWinners[2].city}</Text>
              <View style={styles.arcPointsRow}>
                <Text style={styles.arcPoints}>{sortedWinners[2].points}</Text>
                <Image source={COIN_ICON} style={styles.arcCoin} />
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Full Leaderboard Section */}
        <View style={styles.leaderboardSection}>
          <Text style={styles.sectionTitle}>Full Leaderboard</Text>
          {top10.map((person, idx) => (
            <View
              key={person.id}
              style={[styles.leaderboardItem, idx === 0 && styles.leaderboardFirst, idx === 1 && styles.leaderboardSecond, idx === 2 && styles.leaderboardThird]}
            >
              <View style={styles.leaderboardRankBox}>
                <Text style={[styles.leaderboardRank, idx === 0 && styles.leaderboardRankFirst, idx === 1 && styles.leaderboardRankSecond, idx === 2 && styles.leaderboardRankThird]}>{idx + 1}</Text>
              </View>
              <Image source={person.profileImage} style={styles.leaderboardProfile} />
              <View style={styles.leaderboardInfo}>
                <Text style={styles.leaderboardName}>{person.name}</Text>
                <Text style={styles.leaderboardLocation}>{person.city}</Text>
              </View>
              <View style={styles.leaderboardPointsRow}>
                <Text style={styles.leaderboardPoints}>{person.points}</Text>
                <Image source={COIN_ICON} style={styles.leaderboardCoin} />
              </View>
            </View>
          ))}
        </View>

        {/* Your Ranking Section */}
        <View style={styles.yourRankingSection}>
          <Text style={styles.sectionTitle}>Your Ranking</Text>
          <View style={[styles.leaderboardItem, styles.yourRankingCard]}>
            <View style={styles.leaderboardRankBox}>
              <Text style={[styles.leaderboardRank, styles.leaderboardRankYou]}>42</Text>
            </View>
            <Image source={require('../../assets/images/profile.jpg')} style={styles.leaderboardProfile} />
            <View style={styles.leaderboardInfo}>
              <Text style={styles.leaderboardName}>Stephanie Beverage</Text>
              <Text style={styles.leaderboardLocation}>Alpharetta, GA</Text>
            </View>
            <View style={styles.leaderboardPointsRow}>
              <Text style={styles.leaderboardPoints}>847</Text>
              <Image source={COIN_ICON} style={styles.leaderboardCoin} />
            </View>
          </View>
    </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5fa',
  },
  gradientHeader: {
    paddingBottom: 32,
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  segmentedControlWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
    gap: 0, // Remove gap for flush alignment
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  segmentButtonActive: {
    backgroundColor: '#DB8633',
  },
  segmentText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  arcRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    marginTop: 10,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  arcCol: {
    alignItems: 'center',
    flex: 1,
  },
  arcFirst: {
    zIndex: 2,
    marginBottom: 0,
  },
  arcSecond: {
    marginTop: 30,
    zIndex: 1,
  },
  arcThird: {
    marginTop: 30,
    zIndex: 1,
  },
  arcCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#2C3E50',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 8,
    width: 80,
    height: 80,
  },
  arcCircleFirst: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  arcCircleSecond: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    marginBottom: 8,
  },
  arcCircleThird: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    marginBottom: 8,
  },
  arcCrown: {
    width: 28,
    height: 28,
    marginBottom: -14,
    zIndex: 2,
  },
  arcImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  arcImageFirst: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  arcName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
    textAlign: 'center',
  },
  arcLocation: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 2,
    textAlign: 'center',
  },
  arcPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
    justifyContent: 'center',
  },
  arcPoints: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  arcCoin: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  leaderboardSection: {
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
  },
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
  leaderboardFirst: {
    borderWidth: 2,
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  leaderboardSecond: {
    borderWidth: 2,
    borderColor: '#7A8D9C',
    backgroundColor: '#F0F4F8',
  },
  leaderboardThird: {
    borderWidth: 2,
    borderColor: '#B8860B',
    backgroundColor: '#F9F6F0',
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
  leaderboardRankFirst: {
    color: '#DB8633',
  },
  leaderboardRankSecond: {
    color: '#7A8D9C',
  },
  leaderboardRankThird: {
    color: '#B8860B',
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
  yourRankingSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  yourRankingCard: {
    borderWidth: 2,
    borderColor: '#DB8633',
    backgroundColor: '#FFF5EB',
  },
  leaderboardRankYou: {
    color: '#DB8633',
  },
});
