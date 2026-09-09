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

// `allowPickLater` gates the "Start now, pick later" CTA. Holding a gift
// while you decide only makes sense during signup, before any monthly
// donation exists. An established donor switching causes already gives every
// month, so offering to "start now" reads as nonsense there — and tapping it
// would move their live subscription into held mode.
// `onHelpMeChoose` adds a route back into the guided picker. Someone reading
// this panel has scrolled the whole list without choosing, which is exactly
// the person the picker was built for, so the way back to it belongs here.
// Optional: when it is not supplied the panel renders as it always did.
export default function SupportThrivePanel({
  thriveCharity,
  isLoading,
  onPickGrow,
  onPickHold,
  onHelpMeChoose,
  allowPickLater = true,
}) {
  const disabled = !thriveCharity || isLoading;
  // Help me choose needs no THRIVE charity loaded, so it is never disabled by
  // the same condition the pick-later CTA depends on.
  const showHelp = allowPickLater && typeof onHelpMeChoose === 'function';

  return (
    <View style={styles.wrapper}>
      <Text style={styles.headline}>
        {!allowPickLater
          ? 'Want to support THRIVE directly?'
          : showHelp
            ? 'Not sure where to start?'
            : 'Need more time to decide?'}
      </Text>
      <Text style={styles.body}>
        {!allowPickLater
          ? 'Your giving can go toward growing the platform and reaching more cities.'
          : showHelp
            ? 'We can narrow it down for you, or you can start now and pick a cause anytime.'
            : 'No pressure. Start your monthly gift now and pick a cause anytime.'}
      </Text>

      {/* Above the pick-later CTA, and the filled one of the pair, matching
          the picker where Help me choose is the orange button and Start now,
          pick later is the outline. Someone who has seen both screens should
          recognise the same two options in the same order. */}
      {showHelp && (
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={() => onHelpMeChoose?.()}
        >
          <Text style={styles.primaryBtnText}>Help me choose</Text>
        </TouchableOpacity>
      )}

      {allowPickLater && (
        <TouchableOpacity
          style={[
            showHelp ? styles.outlineBtn : styles.primaryBtn,
            disabled && styles.disabled,
          ]}
          activeOpacity={0.85}
          onPress={() => thriveCharity && onPickHold?.(thriveCharity)}
          disabled={disabled}
        >
          {isLoading ? (
            <ActivityIndicator color={showHelp ? '#324E58' : '#fff'} size="small" />
          ) : (
            <Text style={showHelp ? styles.outlineBtnText : styles.primaryBtnText}>
              Start now, pick later  →
            </Text>
          )}
        </TouchableOpacity>
      )}

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
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#324E58',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
  },
  outlineBtnText: {
    color: '#324E58',
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
