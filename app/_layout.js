// file: app/_layout.js
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context'; // add this
import { View, StyleSheet } from 'react-native';
import { BeneficiaryProvider } from './context/BeneficiaryContext';

export default function Layout() {
  return (
    <BeneficiaryProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Stack initialRouteName="splashScreen" screenOptions={{ headerShown: false }} />
        </View>
      </SafeAreaView>
    </BeneficiaryProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
});
