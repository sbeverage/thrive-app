// Home-tab banner shown to donors who picked "Save my spot" during signup.
// Surfaces the running held balance and pushes a gentle "Choose your cause"
// CTA. Disappears the moment they redirect their held funds to a real cause.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import API from '../lib/api';

export default function HeldFundsBanner() {
  const router = useRouter();
  const [data, setData] = useState({ balance: 0, transaction_count: 0, subscription_held: false });

  const refresh = useCallback(async () => {
    try {
      const res = await API.getHeldBalance();
      setData(res || { balance: 0, transaction_count: 0, subscription_held: false });
    } catch (_) {
      // logged out / no sub — banner stays hidden
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Banner only renders when the user is in "Save my spot" mode (active held
  // subscription) OR has prior held charges they haven't redirected yet.
  if (!data.subscription_held && (data.balance ?? 0) <= 0) return null;

  const amountLabel = data.balance > 0
    ? `$${Number(data.balance).toFixed(2).replace(/\.00$/, '')} set aside`
    : 'Your future cause is reserved';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.banner}
      onPress={() => router.push('/(tabs)/beneficiary')}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="bookmark" size={18} color="#fff" />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>Saving your spot</Text>
        <Text style={styles.subtitle}>
          {amountLabel} · tap to choose a cause and we'll direct it there.
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color="#324E58" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF6E8',
    borderColor: '#DB8633',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DB8633',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#324E58',
  },
  subtitle: {
    fontSize: 12,
    color: '#5A6470',
    marginTop: 2,
    lineHeight: 16,
  },
});
