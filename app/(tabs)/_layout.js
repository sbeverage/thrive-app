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
            <View style={styles.footerNavWrapper}>
              {tabs.map((tab, idx) => {
                const focused = pathname.includes(tab.name);
                const isDiscounts = tab.name === 'discounts';
                
                return (
                  <TouchableOpacity
                    key={tab.name}
                    style={[
                      styles.footerItem,
                      isDiscounts && styles.discountsItem
                    ]}
                    onPress={() => {
                      setActiveTab(tab.name);
                      router.push(`/${tab.name}`);
                    }}
                  >
                    {isDiscounts ? (
                      <View style={styles.discountsButton}>
                        <Image
                          source={tab.icon}
                          style={{
                            width: focused ? 28 : 24,
                            height: focused ? 28 : 24,
                            tintColor: '#fff',
                          }}
                        />
                        <Text style={styles.discountsText}>
                          {tab.label}
                        </Text>
                      </View>
                    ) : (
                      <>
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
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
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
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 99,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 60,
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 10,
    color: '#6D6E72',
    marginTop: 2,
    fontFamily: 'Figtree_400Regular',
  },
  footerTextActive: {
    fontSize: 10,
    color: '#DB8633',
    marginTop: 2,
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
    right: 0,
    bottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100,
  },
  discountsItem: {
    marginTop: -25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#DB8633',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  discountsText: {
    color: '#fff',
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'Figtree_700Bold',
    fontWeight: '700',
  },
});
