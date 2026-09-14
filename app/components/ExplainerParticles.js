/**
 * Coin rain and heart pops for the explainer screen's staged reveal.
 *
 * Built on React Native's core Animated rather than moti. moti is in
 * package.json but is not used anywhere in the app, and it is version 0.30
 * against Reanimated 4.3 when it was written for Reanimated 3. The teaser's
 * flying coins already prove core Animated works on this New Architecture
 * build, and this screen is the first thing a verified donor sees, so it is
 * the wrong place to debut an unproven dependency.
 *
 * Both effects are short bursts, not loops. A continuous shower competes with
 * the words for attention, which is the opposite of the point: the particles
 * exist to say "look here now", then get out of the way.
 *
 * Everything is native-driven (opacity and transform only) so the bursts do
 * not fight the JS thread while the cards are also animating in.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

const COIN = require('../../assets/icons/coin.png');
const HEART = require('../../assets/icons/heart.png');

/** Stable per-particle randomness. Regenerating it each render would make
 *  particles jump mid-flight. */
function useParticleSeeds(count, make) {
  return useMemo(
    () => Array.from({ length: count }, (_, i) => make(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count],
  );
}

/**
 * Coins falling like rain across a band of the screen.
 *
 * @param {boolean} run    start the burst
 * @param {number}  width  how wide to scatter across
 * @param {number}  fall   how far each coin travels
 */
export function CoinRain({ run, width, fall = 190, count = 14 }) {
  const progress = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;

  const seeds = useParticleSeeds(count, (i) => ({
    x: Math.random() * Math.max(width - 26, 1),
    size: 15 + Math.random() * 11,
    delay: i * 55 + Math.random() * 90,
    duration: 850 + Math.random() * 450,
    spin: Math.random() > 0.5 ? 1 : -1,
    drift: (Math.random() - 0.5) * 26,
  }));

  useEffect(() => {
    if (!run) return;
    const runs = progress.map((v, i) => {
      v.setValue(0);
      return Animated.timing(v, {
        toValue: 1,
        duration: seeds[i].duration,
        delay: seeds[i].delay,
        easing: Easing.in(Easing.quad), // gravity, not linear drift
        useNativeDriver: true,
      });
    });
    const group = Animated.parallel(runs);
    group.start();
    return () => group.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  if (!run) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {progress.map((v, i) => {
        const s = seeds[i];
        return (
          <Animated.Image
            key={i}
            source={COIN}
            style={[
              styles.particle,
              {
                left: s.x,
                width: s.size,
                height: s.size,
                // One transform array. A second transform prop would replace
                // this one outright rather than merging with it.
                transform: [
                  {
                    translateY: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-30, fall],
                    }),
                  },
                  {
                    translateX: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, s.drift],
                    }),
                  },
                  {
                    rotate: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${s.spin * 220}deg`],
                    }),
                  },
                ],
                opacity: v.interpolate({
                  inputRange: [0, 0.12, 0.75, 1],
                  outputRange: [0, 1, 1, 0],
                }),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Hearts popping upward, the way a like animation reads: quick scale-in,
 * drift up, fade out.
 */
export function HeartPop({ run, width, rise = 92, count = 10 }) {
  const progress = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;

  const seeds = useParticleSeeds(count, (i) => ({
    // Cluster toward the middle so it reads as coming from the card, not the
    // screen edges.
    x: width * 0.5 + (Math.random() - 0.5) * width * 0.62,
    size: 16 + Math.random() * 12,
    delay: i * 70 + Math.random() * 70,
    duration: 780 + Math.random() * 320,
    sway: (Math.random() - 0.5) * 34,
  }));

  useEffect(() => {
    if (!run) return;
    const runs = progress.map((v, i) => {
      v.setValue(0);
      return Animated.timing(v, {
        toValue: 1,
        duration: seeds[i].duration,
        delay: seeds[i].delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
    });
    const group = Animated.parallel(runs);
    group.start();
    return () => group.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  if (!run) return null;

  return (
    <View pointerEvents="none" style={styles.layer}>
      {progress.map((v, i) => {
        const s = seeds[i];
        return (
          <Animated.Image
            key={i}
            source={HEART}
            style={[
              styles.particle,
              {
                left: s.x - s.size / 2,
                width: s.size,
                height: s.size,
                tintColor: '#DB8633',
                transform: [
                  {
                    translateY: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -rise],
                    }),
                  },
                  {
                    translateX: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, s.sway],
                    }),
                  },
                  {
                    // Overshoot slightly then settle, so it pops rather than
                    // simply growing.
                    scale: v.interpolate({
                      inputRange: [0, 0.28, 0.55, 1],
                      outputRange: [0.3, 1.12, 0.95, 0.9],
                    }),
                  },
                ],
                opacity: v.interpolate({
                  inputRange: [0, 0.15, 0.7, 1],
                  outputRange: [0, 1, 1, 0],
                }),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  particle: {
    position: 'absolute',
    top: 0,
    resizeMode: 'contain',
  },
});
