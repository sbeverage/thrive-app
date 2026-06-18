// Lightweight inline prompt shown at the end of the BeneficiaryScreen +
// empty-search state during signup. No card chrome — just a warm headline,
// one short reassurance, one primary CTA for the no-commit path, and a
// quiet text link for the "give to THRIVE directly" power-user option.
//
// Design intent: a busy signing-up donor scanning past the cause list
// should immediately understand they're not stuck — they can start now
// and pick later. Visual weight is intentionally low so it reads as a
// soft alternative rather than a "feature pitch."

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';

export default function SupportThrivePanel({ thriveCharity, isLoading, onPickGrow, onPickHold }) {
  const disabled = !thriveCharity || isLoading;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.headline}>Need more time to decide?</Text>
      <Text style={styles.body}>
        Your monthly gift will be held with THRIVE until you pick a cause — anytime within 6 months. After that, it stays with us.
      </Text>

      <TouchableOpacity
        style={[styles.primaryBtn, disabled && styles.disabled]}
        activeOpacity={0.85}
        onPress={() => thriveCharity && onPickHold?.(thriveCharity)}
        disabled={disabled}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>Start now — pick later  →</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => thriveCharity && onPickGrow?.(thriveCharity)}
        disabled={disabled}
        style={styles.linkRow}
      >
        <Text style={[styles.linkText, disabled && styles.disabled]}>
          Or donate to THRIVE Initiative  →
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
  },
  headline: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 6,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    color: '#5A6470',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    backgroundColor: '#DB8633',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  linkRow: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  linkText: {
    fontSize: 13,
    color: '#8C8C8C',
    textDecorationLine: 'underline',
    textDecorationColor: '#C8C8C8',
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.5,
  },
});
