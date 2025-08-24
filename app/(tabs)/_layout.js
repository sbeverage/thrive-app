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
    { name: 'leaderboard', label: 'Rank', icon: require('../../assets/icons/leaderboard.png') },
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BeneficiaryProvider>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Only apply paddingBottom if footer is visible */}
          <View style={{ flex: 1, paddingBottom: hideFooter ? 0 : 70 }}>
            <Slot />
          </View>

          {!hideFooter && (
            <View style={styles.footerNavWrapper}>
              {tabs.map((tab, idx) => {
                const focused = activeTab === tab.name;
                
                return (
                  <TouchableOpacity
                    key={tab.name}
                    style={styles.footerItem}
                    onPress={() => {
                      setActiveTab(tab.name);
                      router.push(`/${tab.name}`);
                    }}
                  >
                    <View style={[
                      styles.iconContainer,
                      focused && styles.iconContainerActive
                    ]}>
                      <Image
                        source={tab.icon}
                        style={[
                          styles.tabIcon,
                          focused && styles.tabIconActive
                        ]}
                      />
                    </View>
                    {focused && (
                      <Text style={[
                        styles.tabLabel,
                        focused && styles.tabLabelActive
                      ]}>
                        {tab.label}
                      </Text>
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
    height: 70,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 99,
    paddingBottom: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 50,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: -8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'all 0.2s ease',
  },
  iconContainerActive: {
    backgroundColor: '#DB8633',
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  tabIcon: {
    width: 22,
    height: 22,
    tintColor: '#8E9BAE',
  },
  tabIconActive: {
    tintColor: '#FFFFFF',
  },
  tabLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#8E9BAE',
    fontWeight: 'bold',
  },
  tabLabelActive: {
    color: '#DB8633',
  },
});
