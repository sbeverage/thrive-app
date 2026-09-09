/**
 * The moment between tapping "Help me choose" and seeing three causes.
 *
 * Two beats, using THRIVE's own artwork: the coin goes into the piggy, then
 * flowers bloom out of it. It turns an unavoidable wait into the nicest
 * second of the signup rather than a spinner.
 *
 * SWAP POINT. This is deliberately a small self-contained file so the whole
 * thing can be replaced with a Lottie or Rive file later without touching
 * the picker. Keep the same props: { onDone, quick } and call onDone when
 * finished, because the screen waits on it before revealing the cards.
 *
 * `quick` matters. The full bloom is lovely the first time and a tax by the
 * fifth reroll, so rerolls run a much shorter version.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  AccessibilityInfo,
  Platform,
} from 'react-native';

const PIGGY_COIN = require('../../assets/images/piggy-with-coin.png');
const PIGGY_BLOOM = require('../../assets/images/piggy-app-icon.png');

export default function ChoosingAnimation({ onDone, quick = false, label }) {
  const coin = useRef(new Animated.Value(0)).current;
  const bloom = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const finish = () => {
      if (!done.current && !cancelled) {
        done.current = true;
        onDone?.();
      }
    };

    const run = async () => {
      let reduce = false;
      try {
        reduce = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        /* if we cannot tell, animate */
      }
      if (cancelled) return;

      // Reduce Motion gets the end state and a short pause, not a snap, so
      // the transition still reads as "we are choosing for you".
      if (reduce) {
        coin.setValue(1);
        bloom.setValue(1);
        setTimeout(finish, quick ? 220 : 450);
        return;
      }

      const native = Platform.OS !== 'web';
      const coinMs = quick ? 260 : 620;
      const bloomMs = quick ? 300 : 780;
      const holdMs = quick ? 90 : 380;

      Animated.sequence([
        Animated.timing(coin, {
          toValue: 1,
          duration: coinMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: native,
        }),
        Animated.timing(bloom, {
          toValue: 1,
          duration: bloomMs,
          // Slight overshoot so the flowers spring rather than fade.
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: native,
        }),
        Animated.delay(holdMs),
      ]).start(({ finished }) => {
        if (finished) finish();
      });
    };

    run();
    // Safety net: never leave the donor on an animation that failed to end.
    const bail = setTimeout(finish, quick ? 1200 : 2600);
    return () => {
      cancelled = true;
      clearTimeout(bail);
    };
  }, [coin, bloom, quick, onDone]);

  // One style object per image, and only one. React Native replaces a
  // transform array rather than merging it, and the same goes for opacity, so
  // two style objects both setting either one means the later silently wins.
  // Beat one's fade-in and its fade-out under the flowers are therefore
  // multiplied into a single opacity value rather than set twice.
  const coinStyle = {
    opacity: Animated.multiply(
      coin.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
      bloom.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.35, 0] }),
    ),
    transform: [
      { translateY: coin.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) },
      { scale: coin.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    ],
  };

  // Beat two: the flowers spring in. The 1.1 factor is folded into the
  // interpolation instead of living in the stylesheet, for the same reason.
  const bloomStyle = {
    opacity: bloom,
    transform: [
      { scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) },
    ],
  };

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label || 'Finding causes for you'}
    >
      <View style={styles.stage}>
        <Animated.Image
          source={PIGGY_COIN}
          resizeMode="contain"
          style={[styles.art, coinStyle]}
        />
        <Animated.Image
          source={PIGGY_BLOOM}
          resizeMode="contain"
          style={[styles.art, bloomStyle]}
        />
      </View>
      {!!label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  stage: {
    width: '100%',
    maxWidth: 260,
    aspectRatio: 1,
    position: 'relative',
  },
  art: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  label: {
    marginTop: 18,
    fontSize: 15,
    fontWeight: '600',
    color: '#4C636C',
    textAlign: 'center',
  },
});
