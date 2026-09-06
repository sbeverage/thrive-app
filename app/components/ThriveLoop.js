/**
 * The THRIVE Loop: an explainer that plays by itself.
 *
 * A coin drops into the piggy, a heart goes out to the cause, and a discount
 * comes back from a local shop. Three beats on a nine second loop.
 *
 * Why this and not a video. The explainer screen used to lead with a Watch
 * Video button, which asks for a tap and a download before anyone learns
 * anything, and the people dropping out of signup are exactly the ones who
 * will not do that. This starts the moment the screen mounts, weighs nothing,
 * and works with no signal.
 *
 * The step labels are rendered by the parent and stay on screen the whole
 * time. That is deliberate: the old landing carousel meant most people only
 * ever read step one, so the model was being explained a third at a time.
 *
 * Layout is driven off the measured container width so every offset scales
 * with the device. One SVG unit is width/520 pixels on both axes, because the
 * container holds the viewBox aspect ratio.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Animated,
  Easing,
  StyleSheet,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect, Text as SvgText, G } from 'react-native-svg';

const VB_W = 520;
const VB_H = 340;
const LOOP_MS = 9000;

const NAVY = '#2C3E50';
const TEAL = '#4CA1AF';
const ORANGE = '#DB8633';
const MINT = '#9BD3A8';
const COIN = '#F2C14E';
const LABEL = '#4C636C';

/** SVG units to pixels, given the measured width. */
const u = (n, width) => (n * width) / VB_W;

export default function ThriveLoop({ style }) {
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
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
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (on) => setReduceMotion(!!on),
    );
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || width === 0) return undefined;
    clock.setValue(0);
    const anim = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: LOOP_MS,
        easing: Easing.linear,
        // The animated pieces are plain Views over the artwork, so transform
        // and opacity can run on the native thread.
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [clock, reduceMotion, width]);

  const scene = (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {/* ground */}
      <Ellipse cx={262} cy={292} rx={96} ry={13} fill={TEAL} opacity={0.13} />

      {/* your cause, top left. Where the gift goes. */}
      <Circle cx={105} cy={98} r={40} fill={MINT} opacity={0.22} />
      <Circle cx={105} cy={98} r={40} fill="none" stroke={TEAL} strokeWidth={4} />
      <Path
        d="M105 82 c-7 -10 -23 -8 -23 5 c0 10 13 18 23 26 c10 -8 23 -16 23 -26 c0 -13 -16 -15 -23 -5 z"
        fill={MINT}
        stroke={NAVY}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <SvgText x={105} y={158} textAnchor="middle" fontSize={14} fontWeight="700" fill={LABEL}>
        your cause
      </SvgText>

      {/* local shops, bottom left. Where the discount comes back from. */}
      <Path d="M62 206 l14 -20 h58 l14 20 z" fill={ORANGE} opacity={0.55} />
      <Rect x={70} y={206} width={70} height={46} rx={6} fill={ORANGE} opacity={0.2} />
      <Rect x={70} y={206} width={70} height={46} rx={6} fill="none" stroke={ORANGE} strokeWidth={4} />
      <Rect x={95} y={226} width={20} height={26} rx={3} fill={ORANGE} opacity={0.5} />
      <SvgText x={105} y={276} textAnchor="middle" fontSize={13} fontWeight="700" fill={LABEL}>
        local shops
      </SvgText>

      {/* the piggy */}
      <G>
        <Path
          d="M260 92 c-9 -13 -30 -11 -30 6 c0 13 17 24 30 34 c13 -10 30 -21 30 -34 c0 -17 -21 -19 -30 -6 z"
          fill={MINT}
          stroke={NAVY}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <Rect x={212} y={246} width={22} height={34} rx={8} fill={ORANGE} stroke={NAVY} strokeWidth={4} />
        <Rect x={290} y={246} width={22} height={34} rx={8} fill={ORANGE} stroke={NAVY} strokeWidth={4} />
        <Ellipse cx={262} cy={204} rx={86} ry={62} fill={ORANGE} stroke={NAVY} strokeWidth={5} />
        <Path
          d="M226 152 q-6 -26 18 -30 q6 14 4 30 z"
          fill={ORANGE}
          stroke={NAVY}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <Ellipse cx={188} cy={212} rx={24} ry={19} fill={ORANGE} stroke={NAVY} strokeWidth={4} />
        <Circle cx={182} cy={212} r={3.4} fill={NAVY} />
        <Circle cx={194} cy={212} r={3.4} fill={NAVY} />
        <Path d="M214 186 q9 -9 18 0" fill="none" stroke={NAVY} strokeWidth={4.5} strokeLinecap="round" />
        <Path d="M346 194 q18 -8 12 -24" fill="none" stroke={NAVY} strokeWidth={4.5} strokeLinecap="round" />
        <Rect x={240} y={150} width={46} height={8} rx={4} fill={NAVY} />
      </G>
    </Svg>
  );

  // Interpolations are only meaningful once we know how wide we are.
  const hasSize = width > 0;

  const coinStyle = hasSize && {
    opacity: clock.interpolate({
      inputRange: [0, 0.02, 0.24, 0.28, 1],
      outputRange: [0, 1, 1, 0, 0],
    }),
    transform: [
      {
        translateY: clock.interpolate({
          inputRange: [0, 0.24, 1],
          outputRange: [-u(74, width), u(8, width), u(8, width)],
        }),
      },
    ],
  };

  // Piggy heart sits at about (212, 210); the cause badge at (105, 98).
  const heartStyle = hasSize && {
    opacity: clock.interpolate({
      inputRange: [0, 0.335, 0.37, 0.62, 0.66, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
    }),
    transform: [
      {
        translateX: clock.interpolate({
          inputRange: [0, 0.335, 0.64, 1],
          outputRange: [0, 0, -u(107, width), -u(107, width)],
        }),
      },
      {
        translateY: clock.interpolate({
          inputRange: [0, 0.335, 0.64, 1],
          outputRange: [0, 0, -u(112, width), -u(112, width)],
        }),
      },
    ],
  };

  // The discount travels the other way: from the shopfront back to you. It ran
  // outward in the first draft, which told the story backwards.
  const tagStyle = hasSize && {
    opacity: clock.interpolate({
      inputRange: [0, 0.665, 0.71, 0.94, 0.99, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
    }),
    transform: [
      {
        translateX: clock.interpolate({
          inputRange: [0, 0.665, 0.96, 1],
          outputRange: [-u(120, width), -u(120, width), 0, 0],
        }),
      },
      {
        translateY: clock.interpolate({
          inputRange: [0, 0.665, 0.96, 1],
          outputRange: [-u(6, width), -u(6, width), 0, 0],
        }),
      },
    ],
  };

  // With motion reduced, park all three where they read as one picture rather
  // than freezing on whichever beat happened to be showing.
  const restingCoin = { opacity: 1, transform: [{ translateY: -u(40, width) }] };
  const restingHeart = {
    opacity: 1,
    transform: [{ translateX: -u(62, width) }, { translateY: -u(66, width) }],
  };
  const restingTag = {
    opacity: 1,
    transform: [{ translateX: -u(64, width) }, { translateY: -u(4, width) }],
  };

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="A piggy bank takes a coin, sends a heart to your cause, and a discount comes back from a local shop."
    >
      {scene}

      {hasSize && (
        <>
          {/* the coin */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.piece,
              { left: u(246, width), top: u(131, width), width: u(34, width), height: u(34, width) },
              reduceMotion ? restingCoin : coinStyle,
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 34 34">
              <Circle cx={17} cy={17} r={15} fill={COIN} stroke={NAVY} strokeWidth={4} />
              <SvgText x={17} y={23} textAnchor="middle" fontSize={16} fontWeight="700" fill={NAVY}>
                $
              </SvgText>
            </Svg>
          </Animated.View>

          {/* the gift on its way out */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.piece,
              { left: u(189, width), top: u(190, width), width: u(46, width), height: u(40, width) },
              reduceMotion ? restingHeart : heartStyle,
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 46 40">
              <Path
                d="M23 8 c-7 -10 -23 -8 -23 5 c0 10 13 18 23 26 c10 -8 23 -16 23 -26 c0 -13 -16 -15 -23 -5 z"
                fill={MINT}
                stroke={NAVY}
                strokeWidth={3.5}
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>

          {/* the thank you coming back */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.piece,
              { left: u(192, width), top: u(214, width), width: u(70, width), height: u(40, width) },
              reduceMotion ? restingTag : tagStyle,
            ]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 70 40">
              <Path
                d="M14 2 h48 a8 8 0 0 1 8 8 v20 a8 8 0 0 1 -8 8 h-48 l-14 -18 z"
                fill={ORANGE}
                stroke={NAVY}
                strokeWidth={3.5}
                strokeLinejoin="round"
              />
              <Circle cx={12} cy={20} r={4} fill={NAVY} />
              <SvgText x={40} y={25} textAnchor="middle" fontSize={13} fontWeight="700" fill="#FFFFFF">
                10% off
              </SvgText>
            </Svg>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: VB_W / VB_H,
    position: 'relative',
  },
  piece: {
    position: 'absolute',
  },
});
