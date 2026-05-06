import { Tabs } from 'expo-router';

/**
 * Three primary surfaces (home / discounts / beneficiary) kept mounted (`lazy: false`)
 * so tab switches don’t unmount/remount (no white flash). Tab bar UI lives in
 * `app/(tabs)/_layout.js` (absolute footer). This navigator hides the default bar.
 */
export default function MainTabLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        lazy: false,
      }}
    />
  );
}
