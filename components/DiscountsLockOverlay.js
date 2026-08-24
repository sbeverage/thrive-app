import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Covers the discounts tab until the donor has a live monthly donation.
 *
 * The server already refuses redemption with a 402 `subscription_required`,
 * so this is the front half of the same rule: rather than letting someone
 * browse, pick a discount and only then hit a wall, the list is dimmed behind
 * a prompt that names the exact thing missing.
 */
export default function DiscountsLockOverlay({ status, onChooseAmount, onUpdatePayment }) {
  // 'no_subscription' means they never set one up — they need to pick an
  // amount and a cause. Any other blocked status (paused, past_due,
  // canceled, incomplete) means the plan exists but isn't collecting, which
  // is almost always a card problem.
  const neverStarted = !status || status === 'no_subscription';

  const title = neverStarted ? 'Unlock your discounts' : 'Your giving is paused';
  const body = neverStarted
    ? 'Choose a monthly amount and add a payment method to start giving — your discounts unlock as soon as your first donation is active.'
    : 'Your monthly donation isn’t active right now, so discounts are locked. Update your payment method to pick things back up.';
  const ctaLabel = neverStarted ? 'Choose my amount' : 'Update payment method';
  const onPrimary = neverStarted ? onChooseAmount : onUpdatePayment;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.card}>
        <View style={styles.lockCircle}>
          <Feather name="lock" size={22} color="#DB8633" />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        <TouchableOpacity style={styles.primary} onPress={onPrimary}>
          <Text style={styles.primaryText}>{ctaLabel}</Text>
        </TouchableOpacity>

        {/* The other path is still reachable — someone with a paused plan may
            want to change the amount, and someone new may already have a card
            on file. */}
        <TouchableOpacity
          style={styles.secondary}
          onPress={neverStarted ? onUpdatePayment : onChooseAmount}
        >
          <Text style={styles.secondaryText}>
            {neverStarted ? 'Manage payment methods' : 'Change my monthly amount'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Scrim rather than a solid fill, so the discounts stay visible-but-faded
    // underneath — the donor can see what they're unlocking.
    backgroundColor: 'rgba(245, 245, 250, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  lockCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#5D6D7E',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  primary: {
    width: '100%',
    backgroundColor: '#DB8633',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondary: {
    paddingVertical: 12,
  },
  secondaryText: {
    color: '#324E58',
    fontSize: 14,
    fontWeight: '600',
  },
});
