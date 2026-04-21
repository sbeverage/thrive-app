import React, { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Tabs, Slot, useRouter, usePathname } from 'expo-router';
import { View, TouchableOpacity, Image, StyleSheet, Text, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BeneficiaryProvider } from '../context/BeneficiaryContext';

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();

  // Sync active tab with current pathname
  const getActiveTab = () => {
    if (pathname?.includes('/home') || pathname === '/' || pathname === '/(tabs)/home') {
      return 'home';
    } else if (pathname?.includes('/discounts') || pathname === '/(tabs)/discounts') {
      return 'discounts';
    } else if (pathname?.includes('/beneficiary') || pathname === '/(tabs)/beneficiary') {
      return 'beneficiary';
    }
    return 'home'; // default
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());

  // Update active tab when pathname changes
  useEffect(() => {
    const newActiveTab = getActiveTab();
    if (newActiveTab !== activeTab) {
      console.log('📱 Tab switching from', activeTab, 'to', newActiveTab, 'pathname:', pathname);
      setActiveTab(newActiveTab);
    }
  }, [pathname, activeTab]);

  // Hide footer on detail and fullscreen pages
  const isDetailPage = /^\/discounts\/[^\/]+$/.test(pathname);
  const hideFooterPages = [
    '/discounts/globalSearch',
    '/discounts/globalSearchFilter',
  ];
  const hideFooter = isDetailPage || hideFooterPages.includes(pathname);

  const tabs = [
    { name: 'home', label: 'Home', icon: require('../../assets/icons/home.png') },
    { name: 'discounts', label: 'Discounts', icon: require('../../assets/icons/discounts.png') },
    { name: 'beneficiary', label: 'Beneficiary', icon: require('../../assets/icons/beneficiary.png') },
  ];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BeneficiaryProvider>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Only apply paddingBottom if footer is visible */}
          <View style={{ flex: 1, paddingBottom: hideFooter ? 0 : 46 }}>
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
                    <View style={[styles.iconContainer, focused ? styles.iconContainerActive : styles.iconContainerInactive]}>
                      <Image
                        source={tab.icon}
                        style={[styles.tabIcon, focused ? styles.tabIconActive : styles.tabIconInactive]}
                      />
                    </View>
                    <Text style={[
                      styles.tabLabel,
                      focused && styles.tabLabelActive
                    ]}>
                      {tab.label}
                    </Text>
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
    height: 46,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    zIndex: 99,
    paddingBottom: 0,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
    marginTop: -22,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerInactive: {
    backgroundColor: 'transparent',
  },
  iconContainerActive: {
    backgroundColor: '#DB8633',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  tabIcon: {
    width: 22,
    height: 22,
  },
  tabIconActive: {
    tintColor: '#FFFFFF',
  },
  tabIconInactive: {
    tintColor: '#9AABB8',
  },
  tabLabel: {
    marginTop: 3,
    fontSize: 11,
    color: '#8E9BAE',
    fontWeight: 'bold',
  },
  tabLabelActive: {
    color: '#DB8633',
  },
});
