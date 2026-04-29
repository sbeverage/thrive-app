import React, { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Tabs, Slot, useRouter, usePathname } from 'expo-router';
import { View, TouchableOpacity, Image, StyleSheet, Text, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeneficiaryProvider } from '../context/BeneficiaryContext';

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom ?? 0;
  // Bar background covers visual height + full safe area
  const NAV_HEIGHT = 56 + bottomInset;

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
  const hideFooter = isDetailPage;

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
          <View style={{ flex: 1, paddingBottom: hideFooter ? 0 : NAV_HEIGHT }}>
            <Slot />
          </View>

          {!hideFooter && (
            <>
              {/* Glass bar background — clipped so blur stays in bounds */}
              <View style={[styles.footerBarBg, { height: NAV_HEIGHT }]}>
                <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
              </View>

              {/* Tab items sit above the safe area */}
              <View style={[styles.footerNavWrapper, { bottom: bottomInset }]}>
                {tabs.map((tab) => {
                  const focused = activeTab === tab.name;
                  return (
                    <TouchableOpacity
                      key={tab.name}
                      style={[styles.footerItem, focused ? styles.footerItemActive : styles.footerItemInactive]}
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
                      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </BeneficiaryProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  footerBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  footerNavWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 76,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    zIndex: 99,
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
  },
  footerItemActive: {
    marginTop: 5,
  },
  footerItemInactive: {
    paddingTop: 37,
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
    width: 24,
    height: 24,
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
    marginTop: 2,
    fontSize: 11,
    color: '#8E9BAE',
    fontWeight: 'bold',
  },
  tabLabelActive: {
    color: '#DB8633',
  },
});
