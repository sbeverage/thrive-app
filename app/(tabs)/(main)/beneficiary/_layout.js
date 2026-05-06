import { Stack } from 'expo-router';

export default function BeneficiaryStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F5F5F5' },
      }}
    />
  );
}
