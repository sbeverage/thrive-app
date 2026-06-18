// Two side-by-side cards shown at the top of the BeneficiaryScreen during
// signup. Lets the donor either commit to supporting THRIVE Initiative
// directly ("Help THRIVE grow") OR set aside their gift while they decide
// on a cause ("Save my spot"). Both routes legally donate to THRIVE — the
// distinction is intent + downstream UI behavior.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

export default function SupportThrivePanel({ thriveCharity, isLoading, onPickGrow, onPickHold }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerLine} />
        <Text style={styles.headerLabel}>NOT SURE WHO TO GIVE TO?</Text>
        <View style={styles.headerLine} />
      </View>

      <Text style={styles.intro}>
        Set aside your monthly gift while you decide on a cause, or support our platform so we can keep growing into more cities to make a larger impact. Either way, you're giving to a registered 501(c)(3).
      </Text>

      <View style={styles.cardsRow}>
        <TouchableOpacity
          style={[styles.card, styles.cardGrow]}
          activeOpacity={0.85}
          onPress={() => thriveCharity && onPickGrow?.(thriveCharity)}
          disabled={!thriveCharity || isLoading}
        >
          <View style={[styles.iconCircle, styles.iconGrow]}>
            <Feather name="trending-up" size={22} color="#fff" />
          </View>
          <Text style={styles.cardTitle}>Help THRIVE grow</Text>
          <Text style={styles.cardBody}>
            Support the platform that makes monthly giving easy. Help us reach more donors, more local businesses, and more cities.
          </Text>
          <View style={[styles.cardCta, styles.cardCtaGrow]}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.cardCtaGrowText}>Give to THRIVE →</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardHold]}
          activeOpacity={0.85}
          onPress={() => thriveCharity && onPickHold?.(thriveCharity)}
          disabled={!thriveCharity || isLoading}
        >
          <View style={[styles.iconCircle, styles.iconHold]}>
            <Ionicons name="bookmark-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.cardTitle}>Save my spot</Text>
          <Text style={styles.cardBody}>
            Donate now while you decide on a cause. Pick one anytime — we'll direct everything you've given there.
          </Text>
          <View style={[styles.cardCta, styles.cardCtaHold]}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.cardCtaHoldText}>Set aside →</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E5',
  },
  headerLabel: {
    fontSize: 11,
    color: '#8C8C8C',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginHorizontal: 10,
  },
  intro: {
    fontSize: 13,
    color: '#5A6470',
    lineHeight: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    minHeight: 200,
    justifyContent: 'space-between',
  },
  cardGrow: {
    backgroundColor: 'rgba(219, 134, 51, 0.06)',
    borderColor: 'rgba(219, 134, 51, 0.35)',
  },
  cardHold: {
    backgroundColor: 'rgba(50, 78, 88, 0.05)',
    borderColor: 'rgba(50, 78, 88, 0.25)',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  iconGrow: { backgroundColor: '#DB8633' },
  iconHold: { backgroundColor: '#324E58' },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 12,
    color: '#5A6470',
    lineHeight: 17,
    marginBottom: 12,
  },
  cardCta: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cardCtaGrow: { backgroundColor: '#DB8633' },
  cardCtaHold: { backgroundColor: '#324E58' },
  cardCtaGrowText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardCtaHoldText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E5',
  },
  dividerLabel: {
    fontSize: 11,
    color: '#8C8C8C',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginHorizontal: 10,
  },
});
