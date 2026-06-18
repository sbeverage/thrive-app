// Single-card panel shown at the end of the BeneficiaryScreen + empty-search
// state during signup. Treats THRIVE Initiative as one entity with two
// intents. The secondary button is intentionally two-line so the mechanism
// is self-explanatory at a glance — donors otherwise read "Save my spot"
// and don't realize their money is still being donated.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function SupportThrivePanel({ thriveCharity, isLoading, onPickGrow, onPickHold }) {
  const disabled = !thriveCharity || isLoading;

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Feather name="heart" size={16} color="#DB8633" />
          <Text style={styles.header}>NOT SURE WHO TO GIVE TO?</Text>
        </View>

        <Text style={styles.body}>
          Support THRIVE Initiative, a 501(c)(3), or start giving now and choose a cause anytime.
        </Text>

        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, disabled && styles.disabledBtn]}
          activeOpacity={0.85}
          onPress={() => thriveCharity && onPickGrow?.(thriveCharity)}
          disabled={disabled}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Give to THRIVE</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.secondaryBtn, disabled && styles.disabledBtn]}
          activeOpacity={0.85}
          onPress={() => thriveCharity && onPickHold?.(thriveCharity)}
          disabled={disabled}
        >
          {isLoading ? (
            <ActivityIndicator color="#324E58" size="small" />
          ) : (
            <View style={styles.secondaryBtnTextWrap}>
              <Text style={styles.secondaryBtnText}>Start now — decide later</Text>
              <Text style={styles.secondaryBtnSubtext}>
                We'll route your gifts to the cause you pick
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8E0D4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  header: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C8C8C',
    letterSpacing: 1.4,
  },
  body: {
    fontSize: 14,
    color: '#324E58',
    lineHeight: 20,
    marginBottom: 16,
  },
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#DB8633',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#324E58',
    marginBottom: 0,
    paddingVertical: 10,
  },
  secondaryBtnTextWrap: {
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#324E58',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtnSubtext: {
    color: '#5A6470',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
});
