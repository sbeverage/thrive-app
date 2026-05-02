import React, { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot, useRouter, usePathname } from 'expo-router';
import { View, TouchableOpacity, Image, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeneficiaryProvider } from '../context/BeneficiaryContext';

/**
 * Custom tab bar (Slot + footer) — not expo-router `<Tabs>`.
 * Keep inactive icons/labels on these hex values so they never pick up iOS template/system blue.
 * Tab screens must not add SafeArea bottom inset (use edges={['top','left','right']}) or a gray band appears above the footer.
 */
const TAB_NAV = {
  pill: '#FFFFFF',
  activeFill: '#DB8633',
  activeIcon: '#FFFFFF',
  inactiveIcon: '#9AABB8',
  inactiveLabel: '#8E9BAE',
  activeLabel: '#DB8633',
};

const ACTIVE_SIZE = 50;
/** Negative margin pulls FAB up; lower = sits closer to bar (nudge down vs half-diameter). */
const ACTIVE_FLOAT_UP = 5;

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom ?? 0;
  /** Solid pill behind labels + home-indicator zone (matches reference: flat top, no faux gray band). */
  const WHITE_BAR_HEIGHT = 52 + bottomInset;

  const getActiveTab = () => {
    if (pathname?.includes('/home') || pathname === '/' || pathname === '/(tabs)/home') {
      return 'home';
    } else if (pathname?.includes('/discounts') || pathname === '/(tabs)/discounts') {
      return 'discounts';
    } else if (pathname?.includes('/beneficiary') || pathname === '/(tabs)/beneficiary') {
      return 'beneficiary';
    }
    return 'home';
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());

  useEffect(() => {
    const next = getActiveTab();
    if (next !== activeTab) {
      console.log('📱 Tab switching from', activeTab, 'to', next, 'pathname:', pathname);
      setActiveTab(next);
    }
  }, [pathname, activeTab]);

  const isDetailPage = /^\/discounts\/[^/]+$/.test(pathname || '');
  const hideFooter = isDetailPage;

  const tabs = [
    { name: 'home', label: 'Home', icon: require('../../assets/icons/home.png') },
    { name: 'discounts', label: 'Discounts', icon: require('../../assets/icons/discounts.png') },
    { name: 'beneficiary', label: 'Beneficiary', icon: require('../../assets/icons/beneficiary.png') },
  ];

  return (
    <GestureHandlerRootView style={styles.flexVisible}>
      <BeneficiaryProvider>
        <View style={styles.sheet}>
          <View style={[styles.slotClip, { paddingBottom: hideFooter ? 0 : WHITE_BAR_HEIGHT }]}>
            <Slot />
          </View>

          {!hideFooter && (
            <>
              <View style={[styles.footerBarSolid, { height: WHITE_BAR_HEIGHT }]} />

              <View style={[styles.footerNavWrapper, { bottom: bottomInset, height: 72 }]}>
                {tabs.map((tab) => {
                  const focused = activeTab === tab.name;
                  return (
                    <TouchableOpacity
                      key={tab.name}
                      style={[styles.footerItem, focused ? styles.footerItemActive : styles.footerItemInactive]}
                      activeOpacity={0.85}
                      onPress={() => {
                        setActiveTab(tab.name);
                        router.push(`/${tab.name}`);
                      }}
                    >
                      <View
                        style={[
                          styles.iconContainer,
                          focused ? styles.iconContainerActive : styles.iconContainerInactive,
                        ]}
                      >
                        <Image
                          source={tab.icon}
                          style={[styles.tabIcon, focused ? styles.tabIconActive : styles.tabIconInactive]}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>{tab.label}</Text>
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
  flexVisible: {
    flex: 1,
    overflow: 'visible',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'visible',
  },
  slotClip: {
    flex: 1,
    overflow: 'visible',
  },
  footerBarSolid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TAB_NAV.pill,
    zIndex: 1,
  },
  footerNavWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    zIndex: 99,
    overflow: 'visible',
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
  },
  footerItemActive: {
    marginTop: -ACTIVE_FLOAT_UP,
  },
  footerItemInactive: {
    paddingTop: 30,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerActive: {
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    borderRadius: ACTIVE_SIZE / 2,
    backgroundColor: TAB_NAV.activeFill,
  },
  iconContainerInactive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  tabIcon: {
    width: 22,
    height: 22,
  },
  tabIconActive: {
    tintColor: TAB_NAV.activeIcon,
  },
  tabIconInactive: {
    tintColor: TAB_NAV.inactiveIcon,
  },
  tabLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: TAB_NAV.inactiveLabel,
  },
  tabLabelActive: {
    color: TAB_NAV.activeLabel,
  },
});
