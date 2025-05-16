// file: app/(tabs)/discounts/globalSearch.js
import React from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const discounts = [
  {
    id: 1,
    brand: 'Starbucks Coffee Shop',
    logo: require('../../../assets/logos/starbucks.png'),
    ends: '31 Dec 2022',
    offers: 3,
  },
  {
    id: 2,
    brand: 'Apple Store',
    logo: require('../../../assets/logos/apple.png'),
    ends: '31 Dec 2022',
    offers: 3,
  },
  {
    id: 3,
    brand: 'Amazon On-Site Store',
    logo: require('../../../assets/logos/amazon.png'),
    ends: '31 Dec 2022',
    offers: 3,
  },
  {
    id: 4,
    brand: 'Cisco',
    logo: require('../../../assets/logos/cisco.png'),
    ends: '31 Dec 2022',
    offers: 3,
  },
  {
    id: 5,
    brand: 'Zara',
    logo: require('../../../assets/logos/zara.png'),
    ends: '31 Dec 2022',
    offers: 3,
  },
];

export default function GlobalSearch() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Global Search</Text>
      </View>

      <View style={styles.searchRow}>
        <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Search Discounts"
          placeholderTextColor="#6d6e72"
          style={styles.searchInput}
        />
        <TouchableOpacity onPress={() => router.push('/(tabs)/discounts/filter')} style={{ marginLeft: 10 }}>
          <Feather name="filter" size={22} color="#DB8633" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Nearby Discounts</Text>
        {discounts.map((item) => (
          <DiscountCard
            key={`nearby-${item.id}`}
            data={item}
            onPress={() => router.push(`/discounts/${item.id}`)}
          />
        ))}

        <Text style={styles.sectionTitle}>All Discounts</Text>
        {discounts.map((item) => (
          <DiscountCard
            key={`all-${item.id}`}
            data={item}
            onPress={() => router.push(`/discounts/${item.id}`)}
          />
        ))}

        <Text style={styles.loadingText}>Loading</Text>
      </ScrollView>
    </View>
  );
}

function DiscountCard({ data, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      <Image source={data.logo} style={styles.logo} resizeMode="contain" />
      <View style={styles.cardContent}>
        <Text style={styles.brand}>{data.brand}</Text>
        <Text style={styles.date}>Ends on {data.ends}</Text>
        <Text style={styles.offer}>{data.offers} discounts available</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
    height: 48,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 10,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 16,
    borderRadius: 8,
  },
  cardContent: {
    flex: 1,
  },
  brand: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  date: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  offer: {
    fontSize: 13,
    color: '#db8633',
    marginTop: 4,
    fontWeight: '500',
  },
  loadingText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 20,
  },
});
