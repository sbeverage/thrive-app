/**
 * The THRIVE Loop: the three step explainer, told with THRIVE's own artwork.
 *
 * The first version of this file drew the piggy, the heart and the coin by
 * hand in SVG paths. It was close but off brand, which is fair: an
 * approximation of a brand illustration is not the brand illustration. This
 * version composites the real assets instead and draws nothing.
 *
 * Three scenes, three seconds each, cross-fading on a nine second loop:
 *
 *   1. piggy-with-coin      the gift going in
 *   2. piggy-app-icon       flowers growing out of it, the gift becoming
 *                           something, which is a better picture of "100% goes
 *                           to your cause" than a heart was
 *   3. piggy-confetti       the thank you coming back
 *
 * Cross-fading whole scenes rather than moving parts around also sidesteps a
 * real problem with the asset set: the illustrations do not all face the same
 * way, so a single character animated across all three beats would flip
 * direction halfway through.
 *
 * Why not a video. The explainer screen used to lead with a Watch Video
 * button, which asks for a tap and a download before anyone learns anything,
 * and the people dropping out of signup are exactly the ones who will not do
 * that. This starts on mount and needs no network.
 *
 * showSteps controls the labels. The landing screen leaves them off because
 * its headline already states the whole exchange in words and repeating it
 * three more times underneath is just noise. The explainer screen turns them
 * on, where all three stay readable at once. That last part matters: the old
 * landing carousel meant most people only ever read step one.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  AccessibilityInfo,
  Platform,
} from 'react-native';

const LOOP_MS = 9000;
const FADE = 0.038; // fraction of the loop spent cross-fading

const SCENES = [
  {
    key: 'give',
    source: require('../../assets/images/piggy-with-coin.png'),
    step: 'STEP 1',
    headline: 'Give $15 a month or more',
    sub: 'You pick the amount.',
    // Nudges the piggy to a similar apparent size across scenes, since the
    // three illustrations crop differently.
    fit: 1,
  },
  {
    key: 'cause',
    source: require('../../assets/images/piggy-app-icon.png'),
    step: 'STEP 2',
    headline: '100% goes to your cause',
    sub: 'Our costs ride on top, never out of your gift.',
    fit: 1.12,
  },
  {
    key: 'thanks',
    source: require('../../assets/images/piggy-confetti.png'),
    step: 'STEP 3',
    headline: 'Shops and restaurants thank you',
    sub: 'Discounts you can redeem, right in the app.',
    fit: 1.02,
  },
];

const THIRD = 1 / SCENES.length;

/** Opacity ramp for the scene that owns [start, start + 1/3) of the loop. */
function sceneOpacity(clock, index) {
  const start = index * THIRD;
  const end = start + THIRD;

  // The first scene also has to fade back in as the last one fades out, so it
  // is visible at both ends of the loop.
  if (index === 0) {
    return clock.interpolate({
      inputRange: [0, end - FADE, end, 1 - FADE, 1],
      outputRange: [1, 1, 0, 0, 1],
    });
  }
  return clock.interpolate({
    inputRange: [0, start - FADE, start, end - FADE, end, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });
}

/** A slow drift across the scene's own window, so it never sits dead still. */
function sceneScale(clock, index, fit) {
  const start = index * THIRD;
  const end = start + THIRD;
  return clock.interpolate({
    inputRange: [0, Math.max(0, start - FADE), end, 1],
    outputRange: [fit * 0.975, fit * 0.975, fit * 1.025, fit * 1.025],
  });
}

export default function ThriveLoop({ style, showSteps = false }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [active, setActive] = useState(0);
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (!cancelled) setReduceMotion(!!on);
      })
      .catch(() => {
        /* if we cannot tell, animate */
      });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on) =>
      setReduceMotion(!!on),
    );
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    clock.setValue(0);
    const anim = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: LOOP_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [clock, reduceMotion]);

  // Drives which label is emphasised. Kept off the animation itself so the
  // opacity work can stay on the native thread.
  useEffect(() => {
    if (reduceMotion || !showSteps) return undefined;
    setActive(0);
    const step = LOOP_MS / SCENES.length;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % SCENES.length);
    }, step);
    return () => clearInterval(id);
  }, [reduceMotion, showSteps]);

  return (
    <View style={style}>
      <View
        style={styles.stage}
        accessible
        accessibilityRole="image"
        accessibilityLabel="Give monthly, all of it reaches your cause, and local shops thank you with discounts."
      >
        {SCENES.map((scene, i) => (
          <Animated.Image
            key={scene.key}
            source={scene.source}
            resizeMode="contain"
            style={[
              styles.art,
              reduceMotion
                ? { opacity: i === 0 ? 1 : 0, transform: [{ scale: scene.fit }] }
                : {
                    opacity: sceneOpacity(clock, i),
                    transform: [{ scale: sceneScale(clock, i, scene.fit) }],
                  },
            ]}
          />
        ))}
      </View>

      {showSteps && (
        <View style={styles.steps}>
          {SCENES.map((scene, i) => {
            const on = reduceMotion || i === active;
            return (
              <View key={scene.key} style={[styles.step, on && styles.stepOn]}>
                <Text style={styles.stepLabel}>{scene.step}</Text>
                <Text style={styles.stepHeadline}>{scene.headline}</Text>
                <Text style={styles.stepSub}>{scene.sub}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 300,
    alignSelf: 'center',
    position: 'relative',
  },
  art: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  steps: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  step: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E1EAEC',
    borderRadius: 13,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  stepOn: {
    borderColor: '#DB8633',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#B96C1F',
    marginBottom: 3,
  },
  stepHeadline: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    color: '#2F4E58',
  },
  stepSub: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#7A8B92',
    marginTop: 3,
  },
});
