import React, { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Tabs, Slot, useRouter, usePathname } from 'expo-router';
import { View, TouchableOpacity, Image, StyleSheet, Text } from 'react-native';
import { BeneficiaryProvider } from '../context/BeneficiaryContext';

export default function AppLayout() {
  const [activeTab, setActiveTab] = useState('home');
  const router = useRouter();
  const pathname = usePathname();

  // Hide footer on detail and fullscreen pages
  const isDetailPage = /^\/discounts\/[^\/]+$/.test(pathname);
  const hideFooterPages = [
    '/discounts/globalSearch',
    '/discounts/globalSearchFilter',
  ];
  const hideFooter = isDetailPage || hideFooterPages.includes(pathname);

  const tabs = [
    { name: 'home', label: 'Home', icon: require('../../assets/icons/home.png') },
    { name: 'beneficiary', label: 'Beneficiary', icon: require('../../assets/icons/beneficiary.png') },
    { name: 'discounts', label: 'Discounts', icon: require('../../assets/icons/discounts.png') },
    { name: 'newsfeed', label: 'Newsfeed', icon: require('../../assets/icons/newsfeed.png') },
    { name: 'leaderboard', label: 'Leaderboard', icon: require('../../assets/icons/leaderboard.png') },
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BeneficiaryProvider>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Only apply paddingBottom if footer is visible */}
          <View style={{ flex: 1, paddingBottom: hideFooter ? 0 : 80 }}>
            <Slot />
          </View>

          {!hideFooter && (
            <>
              <View style={styles.footerNavWrapper}>
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

              <TouchableOpacity
                style={styles.searchButton}
                onPress={() => router.push('/discounts/globalSearch')}
              >
                <Image source={require('../../assets/icons/search.png')} style={{ width: 28, height: 28 }} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </BeneficiaryProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  footerNavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    height: 80,
    borderTopWidth: 0.5,
    borderColor: '#e1e1e5',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 99,
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
    bottom: 68,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100,
  },
});
