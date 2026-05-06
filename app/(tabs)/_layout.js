import React, { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, usePathname } from 'expo-router';
import { View, TouchableOpacity, Image, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeneficiaryProvider } from '../context/BeneficiaryContext';

/**
 * Outer stack: `(main)` (Tabs, 3 roots kept alive) + sibling routes like `menu/*`.
 * Custom footer sits above the stack (same as prior Slot layout).
 */
const TAB_NAV = {
  pill: '#FFFFFF',
  activeFill: '#DB8633',
  activeIcon: '#FFFFFF',
  inactiveIcon: '#9AABB8',
  inactiveLabel: '#8E9BAE',
  activeLabel: '#DB8633',
};

const TAB_BAR_CONTENT_HEIGHT = 56;
const ACTIVE_ICON_SIZE = 39;
const INACTIVE_ICON_SLOT = 33;

export default function TabsRootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom ?? 0;
  const WHITE_BAR_HEIGHT = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  const getActiveTab = () => {
    if (pathname?.includes('/home') || pathname === '/' || pathname === '/(tabs)/home') {
      return 'home';
    }
    if (pathname?.includes('/discounts')) {
      return 'discounts';
    }
    if (pathname?.includes('/beneficiary')) {
      return 'beneficiary';
    }
    return 'home';
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());

  useEffect(() => {
    const next = getActiveTab();
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [pathname, activeTab]);

  const hideFooter = /^\/discounts\/[^/]+$/.test(pathname || '');

  const tabs = [
    { name: 'home', label: 'Home', href: '/home' },
    { name: 'discounts', label: 'Discounts', href: '/discounts' },
    { name: 'beneficiary', label: 'Beneficiary', href: '/beneficiary' },
  ];

  const goTab = (href) => {
    /** Stay inside `(main)` tab navigator; clears stacked overlays like /menu where possible */
    router.replace(href);
  };

  return (
    <GestureHandlerRootView style={styles.flexVisible}>
      <BeneficiaryProvider>
        <View style={styles.sheet}>
          <View style={[styles.slotClip, { paddingBottom: hideFooter ? 0 : WHITE_BAR_HEIGHT }]}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#F5F5F5' },
              }}
            />
          </View>

          {!hideFooter && (
            <View
              style={[
                styles.footerBarSolid,
                { height: WHITE_BAR_HEIGHT, paddingBottom: bottomInset },
              ]}
            >
              <View style={styles.footerNavRow}>
                {tabs.map((tab) => {
                  const focused = activeTab === tab.name;
                  return (
                    <TouchableOpacity
                      key={tab.name}
                      style={styles.footerItem}
                      activeOpacity={0.85}
                      onPress={() => {
                        setActiveTab(tab.name);
                        goTab(tab.href);
                      }}
                    >
                      <View style={styles.iconSlot}>
                        <View
                          style={[
                            styles.iconContainer,
                            focused ? styles.iconContainerActive : styles.iconContainerInactive,
                          ]}
                        >
                          <Image
                            source={
                              tab.name === 'home'
                                ? require('../../assets/icons/home.png')
                                : tab.name === 'discounts'
                                  ? require('../../assets/icons/discounts.png')
                                  : require('../../assets/icons/beneficiary.png')
                            }
                            style={[styles.tabIcon, focused ? styles.tabIconActive : styles.tabIconInactive]}
                            resizeMode="contain"
                          />
                        </View>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
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
    backgroundColor: '#F5F5F5',
    overflow: 'visible',
  },
  slotClip: {
    flex: 1,
    overflow: 'visible',
    backgroundColor: '#F5F5F5',
  },
  footerBarSolid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TAB_NAV.pill,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E6EA',
    zIndex: 99,
    overflow: 'hidden',
  },
  footerNavRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingTop: 3,
  },
  footerItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    height: ACTIVE_ICON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerActive: {
    width: ACTIVE_ICON_SIZE,
    height: ACTIVE_ICON_SIZE,
    borderRadius: ACTIVE_ICON_SIZE / 2,
    backgroundColor: TAB_NAV.activeFill,
  },
  iconContainerInactive: {
    width: INACTIVE_ICON_SLOT,
    height: INACTIVE_ICON_SLOT,
    borderRadius: INACTIVE_ICON_SLOT / 2,
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
    marginTop: 2,
    fontSize: 12,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  tabLabelInactive: {
    color: TAB_NAV.inactiveLabel,
  },
  tabLabelActive: {
    color: TAB_NAV.activeLabel,
  },
});
