/**
 * A field of soft, slowly drifting dots.
 *
 * Purely decorative: it sits behind the content with pointerEvents off and
 * carries no meaning, so it is safe for it to be the first thing removed if a
 * screen ever gets crowded.
 *
 * Every dot is its own looping animation on opacity and transform only, which
 * means all of it runs on the native thread. That matters on the landing
 * screen in particular, where three videos are already decoding: anything here
 * that touched the JS thread each frame would show up as jank in the globe.
 *
 * The drift is deliberately small, a few points over ten seconds or so. The
 * intent is a field that feels alive when you look at it and that you never
 * catch moving while you are reading the words on top of it.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * Default palette: brand colours only, weighted toward the warm accent.
 *
 * This set assumes a white ground. On the blue gradient the navy disappears
 * into it, which is why callers over the gradient pass their own.
 */
const PALETTE = [
  '#DB8633',
  '#DB8633',
  '#E8A765',
  '#4CA1AF',
  '#7FBFC9',
  '#2F4E58',
];

/**
 * Build the dots once.
 *
 * Seeded per mount rather than per render: regenerating these on a re-render
 * would make the whole field jump, and the landing screen re-renders whenever a
 * video reports itself loaded.
 */
function makeDots(count, width, height, palette) {
  return Array.from({ length: count }, (_, i) => {
    const r = (n) => Math.random() * n;
    return {
      key: `dot-${i}`,
      left: r(width),
      top: r(height),
      size: 3 + r(11),
      color: palette[Math.floor(r(palette.length))],
      // Small enough that no dot competes with the logo for attention.
      opacity: 0.12 + r(0.34),
      driftX: -14 + r(28),
      driftY: -22 + r(10), // biased upward, so the field feels like it rises
      duration: 5200 + r(6400),
      delay: r(3200),
    };
  });
}

/**
 * @param {number}  width       area to scatter across
 * @param {number}  height      area to scatter across
 * @param {number}  count       how many dots
 * @param {boolean}  still      render them without animating (Reduce Motion)
 * @param {string[]} palette    override the colours, e.g. over the gradient
 */
export default function FloatingDots({
  width,
  height,
  count = 22,
  still = false,
  palette = PALETTE,
  style,
}) {
  const dots = useMemo(
    () => makeDots(count, width, height, palette),
    [count, width, height, palette],
  );

  const values = useRef(dots.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (still) return undefined;

    const loops = values.map((v, i) => {
      const d = dots[i];
      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: d.duration,
            delay: d.delay,
            // Eased at both ends so a dot slows as it turns around rather than
            // visibly bouncing off an invisible boundary.
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: d.duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, dots]);

  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      {dots.map((d, i) => {
        const v = values[i];
        const animated = still
          ? null
          : {
              opacity: v.interpolate({
                inputRange: [0, 1],
                outputRange: [d.opacity, Math.min(1, d.opacity * 1.9)],
              }),
              transform: [
                {
                  translateX: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, d.driftX],
                  }),
                },
                {
                  translateY: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, d.driftY],
                  }),
                },
              ],
            };

        return (
          <Animated.View
            key={d.key}
            style={[
              styles.dot,
              {
                left: d.left,
                top: d.top,
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                backgroundColor: d.color,
                opacity: d.opacity,
              },
              animated,
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
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
  },
});
