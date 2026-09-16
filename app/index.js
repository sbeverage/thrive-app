// file: app/index.js
import React, { useState, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resumeSignupFlowPendingIfAny } from './utils/signupFlowResume';
import { StatusBar } from 'expo-status-bar';
import { Video, ResizeMode } from 'expo-av';
import { VIDEO_ASSETS, IMAGE_ASSETS } from './utils/assetConstants';
import FloatingDots from './components/FloatingDots';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

/**
 * The gradient header's height, which is also the band the dots scatter in.
 *
 * A measured constant rather than a fraction of the screen: the gradient sizes
 * itself to its type and padding, roughly 196, and seeding dots below that just
 * produced dots the header clips away and nobody ever sees.
 */
const GRADIENT_HEIGHT = 328;

/**
 * The video circle's diameter.
 *
 * A constant because three styles need it and they had already drifted apart:
 * circleWrapper was 276 while circleVideo and videoContainer were still the
 * original 300, so the video was being cropped by the wrapper's overflow
 * rather than filling it. The card's lift into the gradient is derived from
 * this too, so the gradient keeps meeting the circle's midpoint.
 */
const CIRCLE = 276;

/**
 * The arc the section icons ride on, replacing the three pagination dots.
 *
 * Wide and shallow rather than a tight semicircle. Two numbers describe it and
 * they are the ones worth touching:
 *
 *   ARC_STEP  how far along, horizontally, one slot of rotation carries an icon
 *   ARC_DROP  how far below the apex the outer two icons sit
 *
 * The radius is derived from those rather than chosen. A circle through the
 * apex and through a point ARC_STEP across and ARC_DROP down has radius
 * (STEP^2 + DROP^2) / (2 * DROP); with 70 and 13 that is 195, and a radius that
 * large is precisely why the visible curve is gentle. Stretch it wider by
 * raising ARC_STEP, flatten it further by lowering ARC_DROP.
 *
 * Deriving it also means the icons sit *on* the drawn track instead of near it,
 * because the track and the icon positions read the same circle.
 */
const ARC_STEP = 70;
const ARC_DROP = 13;
const ARC_TRACK_R =
  (ARC_STEP * ARC_STEP + ARC_DROP * ARC_DROP) / (2 * ARC_DROP);
const CHIP = 34;

/** Where an icon at offset `o` sits on the track, relative to the apex. */
const arcX = (o) => o * ARC_STEP;
const arcY = (o) => {
  const x = arcX(o);
  return ARC_TRACK_R - Math.sqrt(Math.max(0, ARC_TRACK_R * ARC_TRACK_R - x * x));
};

/**
 * One icon per slide, in slides order, each in a different brand colour.
 *
 * give -> heart, shop -> discounts, save -> coin. They are the icons the app
 * already uses for those ideas elsewhere, so a donor meets them here first and
 * then keeps seeing them.
 */
const SECTION_ICONS = [
  { src: require('../assets/icons/heart.png'), color: '#DB8633', tint: true },
  { src: require('../assets/icons/discounts.png'), color: '#4CA1AF', tint: true },
  // Not tinted, and the ring colour is the brand gold instead.
  //
  // tintColor flattens every non-transparent pixel to one colour, so a coin
  // tinted navy came out as a solid navy dot with the $ and the rim gone. The
  // heart and the tag survive it because they read as silhouettes; the coin
  // does not. Its own gold is a brand colour anyway, the same gold as the coin
  // in the piggy's slot.
  { src: require('../assets/icons/coin.png'), color: '#E8A33D', tint: false },
];

/**
 * Dots for the gradient, not for white.
 *
 * The white-background palette leans on #2F4E58 navy, which is close enough to
 * the #2C3E50 end of the gradient to disappear into it. These are the tints
 * that hold up against it, still brand colours, just the light end of them.
 */
const DOTS_ON_GRADIENT = [
  'rgba(255,255,255,0.9)',
  'rgba(255,255,255,0.65)',
  '#E8A765',
  '#DB8633',
  '#9ED2DA',
];

/**
 * How long a slide sits still before the carousel turns itself.
 *
 * The three slides are the whole pitch — give, shop, save — and a donor who
 * only reads the first one has been told to give and not what they get back.
 * Waiting for a swipe meant most people saw exactly one third of it.
 */
const HOLD_MS = 3400;

/**
 * How long the turn itself takes.
 *
 * This is why the scroll is driven by hand instead of scrollToOffset({animated:
 * true}): that uses a fixed native duration of roughly a third of a second,
 * which is fast enough that the rotation is over before the eye finds it. The
 * movement between slides is the thing worth watching here, so it gets its own
 * duration and easing.
 */
const TURN_MS = 1150;

// Supabase Storage Base URL
const SUPABASE_STORAGE_BASE = 'https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/app-assets';

const slides = [
  {
    key: '1',
    title: 'GIVE',
    description: 'Donate monthly to any charity you love.',
    image: { uri: `${SUPABASE_STORAGE_BASE}/assets/images/slider-image-3.png` },
    video: { uri: VIDEO_ASSETS.GIVE_LOOP }, // Using Supabase URL
  },
  {
    key: '2',
    title: 'SHOP',
    description: 'Unlock exclusive deals from local and online partners.',
    image: { uri: `${SUPABASE_STORAGE_BASE}/assets/images/slider-image-1.png` },
    video: { uri: VIDEO_ASSETS.SHOP_LOOP }, // Using Supabase URL
  },
  {
    key: '3',
    title: 'SAVE',
    description: 'Redeem discounts that can save you more than you give.',
    image: { uri: `${SUPABASE_STORAGE_BASE}/assets/images/slider-image-2.png` },
    video: { uri: VIDEO_ASSETS.SAVE_LOOP }, // Using Supabase URL
  },
];

export default function Index()  {
  const router = useRouter();
  const videoRefs = useRef([]);
  const [reduceMotion, setReduceMotion] = useState(false);

  /**
   * How far the globe has turned, in slides.
   *
   * Grows without bound: 0, 1, 2, 3, 4... Each step adds exactly one. The
   * position actually used is this value modulo three, taken natively, which is
   * what makes the loop continuous and one-directional with nothing to reset.
   *
   * An earlier version tracked a base index in state and reset a 0-to-1
   * progress value after every step. That reset and the re-render it triggered
   * are not guaranteed to land in the same frame, and when they do not, the
   * carousel jumps back a slide for one frame. Counting up removes the reset,
   * and therefore removes the seam.
   */
  const spin = useRef(new Animated.Value(0)).current;
  const stepsTaken = useRef(0);

  // Wrapped to [0, 3). Because each slide's motion is sampled over a whole
  // revolution below, the value at 3 equals the value at 0, so the wrap is
  // mathematically invisible rather than hidden.
  const turned = Animated.modulo(spin, slides.length);

  /**
   * Where slide `i` sits when the globe has turned `t` slides, as a signed
   * offset in slots: 0 is dead centre, +1 is one slot to the right, -1 to the
   * left. Always the *shortest* way round, so the value stays in [-1.5, 1.5).
   *
   * This replaced placing panels by the sine of a circle angle, which looked
   * correct and was not. With three panels on a full circle, halfway through a
   * turn the panel travelling behind the globe sits at dead centre with zero
   * opacity while the outgoing and incoming panels sit off at either side. The
   * front of every transition was therefore empty, which on screen read as the
   * carousel blanking out between slides.
   *
   * A signed offset puts the outgoing and incoming panels either side of centre
   * and lets them cross through it, which is what a carousel actually does.
   */
  const offsetOf = (i, t) => {
    const span = slides.length;
    const raw = i - t + span / 2;
    return ((raw % span) + span) % span - span / 2;
  };

  /** 1 when a panel is centred, falling to 0 a full slot away. */
  const nearness = (off) => Math.max(0, 1 - Math.abs(off));

  // Sampled across a full revolution. Because a panel's offset jumps from one
  // extreme to the other as it wraps, and interpolation would sweep across that
  // jump rather than making it, the opacity below is already 0 out there. The
  // sweep happens invisibly.
  const SAMPLES = Array.from({ length: 25 }, (_, k) => (k * slides.length) / 24);

  /** Interpolate one property of slide `i` across the whole revolution. */
  const track = (i, fn) =>
    turned.interpolate({
      inputRange: SAMPLES,
      outputRange: SAMPLES.map((t) => fn(offsetOf(i, t))),
    });

  React.useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (!cancelled) setReduceMotion(on);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // True while a finger is down, so the auto-rotation waits rather than
  // fighting the drag.
  const dragging = useRef(false);
  // Where the spin value sat when the finger landed.
  const dragFrom = useRef(0);
  // stopAnimation hands back the current value asynchronously, so for the first
  // frame or two of a drag we do not yet know where the globe was. Moves are
  // ignored until we do. gestureState.dx is measured from the grant point, so
  // skipping those early frames costs nothing: the first move we do act on is
  // still computed against the correct origin.
  //
  // Without this the origin defaulted to 0, and a drag from SAVE landed on
  // SHOP, one panel backwards, because the maths was done from the wrong place.
  const dragReady = useRef(false);
  // Auto-rotation stays out of the way until this moment.
  const resumeAt = useRef(0);

  const pan = useRef(
    PanResponder.create({
      // Only claim clearly horizontal drags. Anything else belongs to whatever
      // is underneath, and on a short screen this sits near the buttons.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),

      onPanResponderGrant: () => {
        dragging.current = true;
        dragReady.current = false;
        // Take over from wherever the animation had got to, so grabbing the
        // globe mid-turn does not snap it.
        spin.stopAnimation((v) => {
          dragFrom.current = v;
          dragReady.current = true;
        });
      },

      // A full screen of travel turns the globe exactly one panel. Dragging
      // left moves forward, the same direction it turns on its own.
      onPanResponderMove: (_e, g) => {
        if (!dragReady.current) return;
        spin.setValue(dragFrom.current - g.dx / width);
      },

      onPanResponderRelease: (_e, g) => {
        dragging.current = false;

        // A flick so fast that the origin never arrived. Nothing moved, so
        // just hand it back rather than snapping somewhere arbitrary.
        if (!dragReady.current) {
          resumeAt.current = Date.now() + HOLD_MS;
          return;
        }

        const landed = dragFrom.current - g.dx / width;

        // A quick flick should carry to the next panel even if the finger
        // barely moved; a slow drag settles on whichever is nearest.
        let target = Math.round(landed);
        if (Math.abs(g.vx) > 0.4) {
          target = g.vx < 0 ? Math.ceil(landed) : Math.floor(landed);
        }

        stepsTaken.current = target;
        resumeAt.current = Date.now() + HOLD_MS;

        Animated.timing(spin, {
          toValue: target,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      },

      onPanResponderTerminate: () => {
        dragging.current = false;
        resumeAt.current = Date.now() + HOLD_MS;
      },
    }),
  ).current;

  React.useEffect(() => {
    let timer = null;
    let stopped = false;

    const step = () => {
      if (stopped) return;

      // A finger is down, or one has just lifted. Check back shortly rather
      // than turning the globe out from under whoever is holding it.
      if (dragging.current || Date.now() < resumeAt.current) {
        timer = setTimeout(step, 240);
        return;
      }

      stepsTaken.current += 1;

      Animated.timing(spin, {
        toValue: stepsTaken.current,
        // Reduce Motion still gets all three slides, just without the travel
        // between them. A carousel frozen on slide one would hide two thirds of
        // the pitch from exactly the people least able to go looking for it.
        duration: reduceMotion ? 0 : TURN_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (stopped || !finished) return;
        timer = setTimeout(step, HOLD_MS);
      });
    };

    timer = setTimeout(step, HOLD_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      spin.stopAnimation();
    };
  }, [reduceMotion, spin]);

  const onVideoLoad = (index) => {
    // Video loaded successfully
    console.log(`Video ${index + 1} loaded`);
  };

  const onVideoError = (index, error) => {
    // Fallback to static image if video fails to load
    console.log(`Video ${index + 1} error:`, error);
  };



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {/* Gradient header, the same treatment and the same corner radius as
          the home screen, so the first screen a donor sees already looks like
          the app. The logo and both lines of type switch to their white
          versions for it. */}
      <LinearGradient
        colors={['#2C3E50', '#4CA1AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientHeader}
      >
        {/* The drifting dots now sit on the gradient, which is where they came
            from in the reference. Their palette changes with the ground: the
            navy from the white version would vanish against this. */}
        <FloatingDots
          width={width}
          height={GRADIENT_HEIGHT}
          palette={DOTS_ON_GRADIENT}
          still={reduceMotion}
          style={styles.dotField}
        />

        <Text style={styles.welcomeText}>Welcome to</Text>
        <Image
          source={{ uri: IMAGE_ASSETS.INITIATIVE_LOGO_NO_WEB_WHITE }}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <Text style={styles.nonprofitText}>501 (c)(3) non profit organization</Text>
      </LinearGradient>

      {/* The globe and its dots in a white card lifted into the gradient, the
          same overlap the charity picker and the discounts teaser use. */}
      <View style={styles.overlapCard}>
        <View style={styles.stage} {...pan.panHandlers}>
        {slides.map((item, index) => {
          // 0.42 of a screen per slot. Far enough that a panel a full slot
          // away is mostly gone, close enough that the two panels swapping
          // places overlap through the centre instead of leaving a gap.
          const translateX = track(index, (o) => o * width * 0.42);
          // Lifts as it leaves centre, so panels travel over the top rather
          // than straight across. This is what reads as round.
          const translateY = track(index, (o) => -Math.min(Math.abs(o), 1) * 14);
          // Damped: a panel turned far enough to be edge-on is unreadable, and
          // the point is depth rather than a card trick.
          const rotateY = track(index, (o) => `${(o * 45).toFixed(2)}deg`);
          const scale = track(index, (o) => 1 - 0.22 * Math.min(Math.abs(o), 1));
          // A near-linear crossfade. The two panels mid-swap come to about 0.53
          // each, so the centre is always occupied, and a panel a full slot out
          // is at zero and therefore cannot smudge the edge of the screen.
          const opacity = track(index, (o) => Math.pow(nearness(o), 0.9));

          return (
            <Animated.View
              key={item.key}
              style={[
                styles.stageSlide,
                {
                  opacity,
                  transform: [
                    { perspective: 900 },
                    { translateX },
                    { translateY },
                    { rotateY },
                    { scale },
                  ],
                },
              ]}
            >
              <View style={styles.circleWrapper}>
                {item.video ? (
                  <View style={styles.videoContainer}>
                    <Video
                      ref={(ref) => (videoRefs.current[index] = ref)}
                      source={item.video}
                      style={styles.circleVideo}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={true}
                      isLooping={true}
                      isMuted={true}
                      onLoad={() => onVideoLoad(index)}
                      onError={(error) => onVideoError(index, error)}
                      useNativeControls={false}
                    />
                  </View>
                ) : (
                  <Image
                    source={item.image}
                    style={styles.circleVideo}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text style={styles.slideTitle}>{item.title}</Text>
              <Text style={styles.slideDescription}>{item.description}</Text>
            </Animated.View>
          );
        })}
      </View>

      {/* The section arc, driven by the same rotation value as the globe, so
          the icons orbit exactly in step with the panels.

          This replaced three pagination dots. The dots said which of three
          you were on; the icons say what each one is, which is the thing a
          donor landing here has to work out. Nothing tracks an index, so
          nothing can slide backwards when the globe wraps. */}
      <View style={styles.arcWrap}>
        {/* Only the track is clipped. The chips sit outside this wrapper so
            neither they nor the active ring can be cut off, and the apex one
            is free to overlap the copy above. */}
        <View style={styles.arcTrackClip} pointerEvents="none">
          <View style={styles.arcTrack} />
        </View>

        {slides.map((item, index) => {
          const icon = SECTION_ICONS[index];
          return (
            <Animated.View
              key={item.key}
              style={[
                styles.chipSlot,
                {
                  opacity: track(index, (o) => 0.55 + 0.45 * nearness(o)),
                  transform: [
                    { translateX: track(index, arcX) },
                    { translateY: track(index, arcY) },
                    { scale: track(index, (o) => 0.74 + 0.26 * nearness(o)) },
                  ],
                },
              ]}
            >
              {/* The ring fades in as its icon reaches the apex, which is how
                  the active one announces itself. Opacity rather than a colour
                  swap, because colour cannot animate on the native thread. */}
              <Animated.View
                style={[
                  styles.chipRing,
                  {
                    borderColor: icon.color,
                    opacity: track(index, (o) => Math.pow(nearness(o), 1.6)),
                  },
                ]}
              />
              <View style={styles.chip}>
                <Image
                  source={icon.src}
                  style={[
                    styles.chipIcon,
                    icon.tint ? { tintColor: icon.color } : null,
                  ]}
                />
              </View>
            </Animated.View>
          );
        })}
        </View>
      </View>

      {/* Development builds only. Jumps past signup and email verification
          straight into a screen. __DEV__ is false in a release build so a
          donor never sees this, and devMenu refuses to render outside
          development as well. */}
      {__DEV__ && (
        <TouchableOpacity
          style={styles.devButton}
          onPress={() => router.push('/devMenu')}
          accessibilityRole="button"
        >
          <Text style={styles.devButtonText}>Dev: jump into the flow</Text>
        </TouchableOpacity>
      )}

      {/* Bottom stays white. The piggy leans in from the corner with the
          buttons over her. */}
      <View style={styles.bottomArea}>
        <Image
          source={require('../assets/images/peeking-piggy-bottom-right.png')}
          style={styles.cornerPiggy}
          pointerEvents="none"
        />

        <View style={styles.buttonsWrapper}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/signup')}
          >
            <Text style={styles.primaryText}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.outlineText}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    // The gradient header supplies its own top padding now.
    paddingTop: 0,
  },
  welcomeText: {
    fontSize: 22,
    color: '#ffffff',
    marginBottom: 6,
    marginTop: 0,
  },
  headerLogo: {
    width: 310,
    height: 30,
    marginBottom: 8,
  },
  nonprofitText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 0,
    fontWeight: '400',
  },
  gradientHeader: {
    alignItems: 'center',
    // These three numbers are solved together, not picked.
    //
    // The gradient is meant to end near the vertical midpoint of the video
    // circle. The circle's midpoint sits at cardTop + 24 (the card's padding)
    // + 138 (half the circle), and cardTop is the gradient's height minus the
    // card's lift, so the lift has to be 24 + 138 = 162 for the two to meet.
    // That is overlapCard's marginTop below.
    //
    // The height then follows from where the card should sit. The lift is
    // fixed at 162 by the circle, so cardTop = height - 162, which means the
    // ONLY way to show more blue is to make the gradient taller. Growing the
    // height and the lift together, which is what a first attempt did, buries
    // the extra depth behind the card and just raises the card instead.
    //
    // 328 puts the card top back at 166 and the gradient's bottom edge at the
    // circle's midpoint. The visible blue band is therefore 166pt, and the
    // ~78pt type block centres in it with 44pt above. Change the circle size
    // or the card padding and all of these move.
    paddingTop: 44,
    paddingBottom: 206,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  dotField: {
    top: 0,
    left: 0,
    right: 0,
    height: GRADIENT_HEIGHT,
    // Behind the type, above the gradient itself.
    zIndex: 0,
  },
  overlapCard: {
    // 162 = the card's own 24pt padding plus half the 276pt circle, which puts
    // the gradient's bottom edge at the circle's midpoint. See gradientHeader.
    //
    // Only the card's *bottom* grew to make room for the arc. This number and
    // the circle stay put, so the gradient still meets the circle's midpoint.
    marginTop: -(24 + CIRCLE / 2),
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 28,
    // Zero, so the arc finishes flush with the card's bottom edge rather than
    // floating above a band of empty white.
    paddingBottom: 0,
    paddingHorizontal: 12,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    alignItems: 'center',
  },
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Taller than the buttons need, because the piggy lives in here too and
    // this is the band that closes the gap under the card. The dev button sits
    // in that gap during development and is absent from a release build, so the
    // spacing is set for the release layout, not the one I am looking at.
    height: 186,
    justifyContent: 'flex-end',
    paddingBottom: 28,
  },
  stage: {
    // Absolute children need the parent to have a height of its own. This is
    // the circle plus its margin plus a title and two lines of description.
    height: 398,
    width: '100%',
    justifyContent: 'flex-start',
    // Clips the panels either side of the front one to the card.
    //
    // Deliberately here and not on overlapCard: clipping the card itself risks
    // taking its drop shadow with it, and the shadow is what makes the card
    // read as lifted into the gradient. Clipping the stage instead keeps the
    // shadow and stops the outgoing panel bleeding out over the gradient,
    // which is what it did without this.
    overflow: 'hidden',
  },
  stageSlide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    // Only a little, because the white card already pads its contents. At the
    // old 30 the description lost about 60pt of width and broke a line early.
    paddingHorizontal: 8,
    // Hides the reverse of a panel once it has turned past edge-on, so nothing
    // shows through from the far side of the globe.
    backfaceVisibility: 'hidden',
  },
  circleWrapper: {
    // Sized down from the original 300: at 300 the slide came to more than the
    // height available between the header and the buttons, and the overflow
    // was clipped, so SHOP lost "and online partners" and SAVE lost "more than
    // you give", each cut mid-sentence with nothing to indicate it.
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: '#DADADA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    marginBottom: 30,
    overflow: 'hidden', // Ensure video stays within circle bounds
  },
  circleVideo: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
  },
  videoContainer: {
    position: 'relative',
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
  },
  slideTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2F4E58',
    marginBottom: 8,
  },
  slideDescription: {
    fontSize: 16,
    color: '#2F4E58',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  arcWrap: {
    alignSelf: 'center',
    width: '100%',
    // Apex chip centre at CHIP/2, outer chips ARC_DROP below it, plus half a
    // chip for their bottoms and a little air.
    height: CHIP / 2 + ARC_DROP + CHIP / 2 + 3,
    // Negative, so the apex chip lifts into the description above it rather
    // than being pushed down away from it. Nothing clips here: overflow on this
    // wrapper was cutting the top off the active chip's ring.
    marginTop: -4,
  },
  /** Clips the big track circle without touching the chips. */
  arcTrackClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Below this the big circle falls away steeply, and showing that turned
    // the arc into a bowl.
    height: CHIP / 2 + ARC_DROP + CHIP / 2 + 3,
    overflow: 'hidden',
  },
  /**
   * The half circle itself: a full circle whose bottom half is clipped away by
   * arcWrap. Positioned so its top edge passes through the centre of the apex
   * chip, which is what makes the icons look like they are sitting on it rather
   * than floating near it.
   */
  arcTrack: {
    position: 'absolute',
    top: CHIP / 2,
    left: '50%',
    marginLeft: -ARC_TRACK_R,
    width: ARC_TRACK_R * 2,
    height: ARC_TRACK_R * 2,
    borderRadius: ARC_TRACK_R,
    borderWidth: 1.5,
    borderColor: '#E6ECEF',
  },
  chipSlot: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -CHIP / 2,
    width: CHIP,
    height: CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  chip: {
    width: CHIP,
    height: CHIP,
    borderRadius: 11,
    backgroundColor: '#F3F6F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
  /**
   * 225 x 400 keeps the asset's 941:1672 ratio. The piggy occupies roughly the
   * bottom half and right two thirds of that canvas, so anchoring the image to
   * the corner puts her in the corner, and the height is chosen so she clears
   * the panel's top edge by a little rather than being swallowed by it.
   */
  cornerPiggy: {
    position: 'absolute',
    // Pushed further off the right edge than looks right on paper. At -6 she
    // reached far enough in that the Login label sat across her snout, and a
    // button you have to squint at is a worse trade than a slightly smaller
    // piggy. Tucked out here the label clears her and she still reads as
    // leaning in from the corner.
    right: -12,
    // 66, and the limit is tighter than the asset suggests.
    //
    // The canvas has no transparent margin at its bottom, but her lowest
    // *on-screen* pixel is row 1562 of 1672: the rest of her belly is in the
    // 22pt that `right` pushes off the edge. So the number that matters is
    // 20pt above the canvas bottom, which at this size puts her feet at y=788,
    // ten points clear of the Login button's top edge at 798. Much below 60
    // and she starts touching it.
    bottom: 35,
    // 176 x 313 keeps the asset's 941:1672 ratio. Both numbers have to move
    // together or she stretches.
    width: 176,
    height: 313,
    resizeMode: 'contain',
  },
  buttonsWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    // Above the piggy, so a tap near her still hits the button.
    zIndex: 2,
  },
  primaryButton: {
    backgroundColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#db8633',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlineText: {
    color: '#db8633',
    fontWeight: '600',
    fontSize: 16,
  },
  devButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#B9C7CC',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  devButtonText: { color: '#7A9099', fontSize: 13, fontWeight: '600' },
});
