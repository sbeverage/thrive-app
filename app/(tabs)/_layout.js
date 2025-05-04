import React, { useState } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { View, TouchableOpacity, Image, StyleSheet, Text } from 'react-native';

export default function TabsLayout() {
  const [activeTab, setActiveTab] = useState('home');
  const router = useRouter();
  const pathname = usePathname();

  // ✅ Check if on a dynamic vendor detail screen like /discounts/123
  const isDetailPage = /^\/discounts\/[^\/]+$/.test(pathname);

  const tabs = [
    { name: 'home', label: 'Home', icon: require('../../assets/icons/home.png') },
    { name: 'beneficiary', label: 'Beneficiary', icon: require('../../assets/icons/beneficiary.png') },
    { name: 'discounts', label: 'Discounts', icon: require('../../assets/icons/discounts.png') },
    { name: 'newsfeed', label: 'Newsfeed', icon: require('../../assets/icons/newsfeed.png') },
    { name: 'leaderboard', label: 'Leaderboard', icon: require('../../assets/icons/leaderboard.png') },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      />

      {/* ✅ Show footer only if not on detail page */}
      {!isDetailPage && (
        <>
          <View style={styles.footerNavWrapper}>
            <View style={styles.footerNav}>
              {tabs.map((tab) => {
                const focused = pathname.includes(tab.name);
                return (
                  <TouchableOpacity
                    key={tab.name}
                    style={styles.footerItem}
                    onPress={() => {
                      setActiveTab(tab.name);
                      router.push(`/${tab.name}`);
                    }}
                  >
                    <Image
                      source={tab.icon}
                      style={{
                        width: focused ? 28 : 24,
                        height: focused ? 28 : 24,
                        tintColor: focused ? '#DB8633' : '#6D6E72',
                      }}
                    />
                    <Text style={focused ? styles.footerTextActive : styles.footerText}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Floating Search Button */}
          <TouchableOpacity style={styles.searchButton}>
            <Image source={require('../../assets/icons/search.png')} style={{ width: 28, height: 28 }} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footerNavWrapper: {
    backgroundColor: '#ffffff',
    paddingTop: 10,
    paddingBottom: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },
  footerNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 60,
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 10,
    color: '#6D6E72',
    marginTop: 4,
    fontFamily: 'Figtree_400Regular',
  },
  footerTextActive: {
    fontSize: 10,
    color: '#DB8633',
    marginTop: 4,
    fontFamily: 'Figtree_700Bold',
  },
  searchButton: {
    backgroundColor: '#DB8633',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 30,
    bottom: 70,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
});

