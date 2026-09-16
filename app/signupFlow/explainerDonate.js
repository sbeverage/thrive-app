import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Dimensions,
  Linking,
  Alert,
  Modal,
  Platform,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { CoinRain, HeartPop } from '../components/ExplainerParticles';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BACK_BUTTON, BACK_ICON } from '../utils/signupChrome';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, Audio } from 'expo-av';
import { VIDEO_ASSETS } from '../utils/assetConstants';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';
import { useUser } from '../context/UserContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// 2-3 min donation explainer video (Supabase) - no fallback
const DONATION_VIDEO_URL = VIDEO_ASSETS.DONATION_EXPLAINER;

/**
 * Staged reveal timings.
 *
 * STAGGER is the one number worth tuning. It is 700ms rather than the two or
 * three seconds a "pause so people read each card" implies, and that is
 * deliberate: a pause long enough to finish reading a card is long enough for
 * the reader to feel held up, and they look away or start hunting for the
 * button. What actually directs attention is the arrival itself. Each card
 * landing in turn says "this one now" without ever making the screen feel
 * locked, and the whole sequence is done in under three seconds.
 *
 * Nothing here gates the button. A donor can leave on the first frame.
 */
// Particles scatter across the inside of a benefit card, so this has to track
// the real geometry: infoCard is 90% wide capped at CARD_MAX_WIDTH with
// CARD_PAD each side, and each benefit card adds BENEFIT_PAD of its own. These
// are constants rather than literals because the numbers were previously
// duplicated here and in the stylesheet, and changing the card size silently
// left the bursts scattering across the old width.
const CARD_MAX_WIDTH = 360;
const CARD_PAD = 30;
const BENEFIT_PAD = 18;
const CARD_INNER_WIDTH =
  Math.min(SCREEN_WIDTH * 0.9, CARD_MAX_WIDTH) - CARD_PAD * 2 - BENEFIT_PAD * 2;

/**
 * Staged reveal, in ms from the start.
 *
 * The cards arrive one at a time and each one stays: card two does not replace
 * card one, it joins it. By the end the whole message is on screen, which is
 * also the state a donor who skips or returns sees, so nothing ever has to be
 * re-read.
 *
 * PAUSE is the number to tune. It is the gap between one card landing and the
 * next arriving, which is the whole point of staging this: long enough to take
 * the card in, short enough that nobody feels held up. Only opacity and
 * transform animate, never height, so the layout never shifts.
 */
const ENTER = 340;     // a card arriving
const PAUSE = 1550;    // dwell after a card lands, before the next arrives
const TITLE_DUR = 420;
const FIRST_AT = 520;  // card one waits for the headline to settle

const IN_AT = [
  FIRST_AT,
  FIRST_AT + ENTER + PAUSE,
  FIRST_AT + 2 * (ENTER + PAUSE),
];
const REVEAL = { IN_AT, ENTER, PAUSE, TITLE_DUR };

// Plays on every visit to this screen. It was gated to once per app session,
// which sounded prudent and was wrong twice over: a donor only passes through
// here once in a normal signup, and the app auto-resumes to this screen on
// launch, so the single allowed play was often spent before anyone was
// looking. The only real replay case is resuming an interrupted signup, where
// four and a half seconds costs nothing.

/**
 * The third card's copy, which is the one promise that isn't true for everyone.
 *
 * A coworking member's gift is billed by their space and a team member's is
 * covered by their team, so "set up monthly donations" describes an action
 * neither of them will ever take. This screen is the first thing they see after
 * verifying their email, three screens before anything tells them the gift is
 * already handled, so a wrong impression formed here is the one they carry into
 * the rest of signup.
 *
 * The general flow's wording is left exactly as it is.
 */
function monthlyImpactCopy(flow) {
  if (flow === 'coworking') {
    return 'Your monthly gift is already covered by your THRIVE Coworking membership';
  }
  if (flow === 'team') {
    return 'Your monthly gift is already covered by your team';
  }
  return 'Set up monthly donations to create lasting change';
}

export default function ExplainerDonate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useUser();

  /**
   * Back out of the first screen of the signup flow.
   *
   * Every route into this screen uses router.replace, so there is nothing
   * behind it on the stack. router.back() was therefore either a no-op or an
   * eject to the root, with no warning either way, and an account already
   * exists by the time a donor is standing here.
   *
   * So ask, and then actually do what the answer says. Confirming used to be
   * impossible to express; leaving now signs out properly through the same
   * logout the menu uses, which also clears signupFlowPending so the next
   * launch does not try to resume a flow nobody is signed in for.
   *
   * Kept as a question rather than removing the arrow: a screen with no way
   * out is its own problem, and some people genuinely do want to stop.
   */
  const confirmLeaveSignup = () => {
    Alert.alert(
      'Leave setup?',
      "Your account is saved, but you'll need to log in again to finish setting up your giving.",
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ],
    );
  };
  const params = useLocalSearchParams();
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef(null);

  // One Animated.Value per revealed element, 0 = not yet arrived, 1 = settled.
  // Opacity and translateY both read off the same value so a card cannot be
  // half faded and fully risen.
  const reveal = useRef({
    title: new Animated.Value(0),
    cards: [
      new Animated.Value(0),
      new Animated.Value(0),
      new Animated.Value(0),
    ],
  }).current;

  // Which particle burst is currently allowed to run.
  const [burst, setBurst] = useState({ confetti: false, coins: false, hearts: false });
  const burstTimers = useRef([]);
  const sequence = useRef(null);

  /** Jump straight to the settled state. Used for Reduce Motion, for repeat
   *  visits, and when the donor taps to skip. */
  const settled = useRef(false);
  const settleImmediately = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    sequence.current?.stop();
    burstTimers.current.forEach(clearTimeout);
    burstTimers.current = [];
    reveal.title.setValue(1);
    reveal.cards.forEach((v) => v.setValue(1));
    setBurst({ confetti: false, coins: false, hearts: false });
  }, [reveal]);

  useEffect(() => {
    let cancelled = false;

    const play = async () => {
      // iOS Reduce Motion is a real accessibility request, not a preference to
      // second-guess. Honour it by showing the finished screen.
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduceMotion = false;
      }
      if (cancelled) return;

      if (reduceMotion) {
        settleImmediately();
        return;
      }

      // One chain per Animated.Value, never several at once.
      //
      // An earlier version put several delayed timings on the same value
      // inside one Animated.parallel. Attaching a second animation to a value
      // stops the first, and parallel defaults to stopTogether: true, so that
      // stop cascaded through the group: the cards still ended up visible
      // because the last animation attached to each one won, but the headline
      // had only one animation and was stopped at 0 before it ran, leaving the
      // title invisible while the cards animated fine. One chain per value,
      // and stopTogether off, removes the whole class of problem.
      const enter = (value, delay, duration) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);

      sequence.current = Animated.parallel(
        [
          enter(reveal.title, 0, REVEAL.TITLE_DUR),
          enter(reveal.cards[0], REVEAL.IN_AT[0], REVEAL.ENTER),
          enter(reveal.cards[1], REVEAL.IN_AT[1], REVEAL.ENTER),
          enter(reveal.cards[2], REVEAL.IN_AT[2], REVEAL.ENTER),
        ],
        { stopTogether: false },
      );
      sequence.current.start();

      // One burst per card, fired as it lands and cleared before the next, so
      // only one effect is ever competing with the words.
      const arm = (key, when, life) => {
        burstTimers.current.push(
          setTimeout(() => setBurst((b) => ({ ...b, [key]: true })), when),
          setTimeout(() => setBurst((b) => ({ ...b, [key]: false })), when + life),
        );
      };
      arm('confetti', REVEAL.IN_AT[0] + 40, REVEAL.PAUSE);
      arm('coins', REVEAL.IN_AT[1] + 40, REVEAL.PAUSE);
      arm('hearts', REVEAL.IN_AT[2] + 40, REVEAL.PAUSE);
    };

    play();

    return () => {
      cancelled = true;
      sequence.current?.stop();
      burstTimers.current.forEach(clearTimeout);
      burstTimers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fade up and rise into place. 18px is enough to read as arriving without
   *  the layout visibly jumping. */
  const revealStyle = (value) => ({
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  });

  const paramsSnapshot = JSON.stringify(params ?? {});

  useEffect(() => {
    persistSignupFlowCheckpointFromParams('/signupFlow/explainerDonate', params);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkpoint when serialized route params change
  }, [paramsSnapshot]);

  const handleContinue = () => {
    try {
      if (params?.flow === 'team') {
        // Team accounts have no sponsor amount to carry through.
        router.push({
          pathname: '/signupFlow/discountTeaser',
          params: { flow: 'team' },
        });
      } else if (params?.flow === 'coworking') {
        router.push({
          pathname: '/signupFlow/discountTeaser',
          params: { flow: 'coworking', sponsorAmount: params?.sponsorAmount || '15' }
        });
      } else {
        router.push('/signupFlow/discountTeaser');
      }
    } catch (error) {
      console.error('Error navigating to Discount Teaser:', error);
      Alert.alert(
        'Something went wrong',
        'Unable to open the next step. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleWatchVideo = async () => {
    try {
      // Set audio mode to allow playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      setShowVideo(true);
      // Start playing video after a short delay to ensure modal is fully open
      setTimeout(async () => {
        if (videoRef.current) {
          try {
            await videoRef.current.playAsync();
            console.log('Video started playing with audio');
          } catch (error) {
            console.log('Error playing video:', error);
          }
        }
      }, 200);
    } catch (error) {
      console.log('Error setting audio mode:', error);
      setShowVideo(true);
    }
  };

  const closeVideo = async () => {
    try {
      // Stop video playback
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
      }
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.log('Error closing video:', error);
    }
    setShowVideo(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Blue gradient as absolute background for top half */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>

      {/* Back Navigation */}
      <TouchableOpacity style={styles.backButton} onPress={confirmLeaveSignup}>
        <Image 
          source={require('../../assets/icons/arrow-left.png')} 
          style={styles.backIcon}
        />
      </TouchableOpacity>

      {/* Main Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentSection}
        showsVerticalScrollIndicator={true}
        bounces={true}
        alwaysBounceVertical={true}
        onTouchStart={settleImmediately}
      >
        {/* Title sits on the gradient, the way the discounts teaser and the
            cause picker do, so this screen stops looking like the odd one out.
            Animating the container rather than the Text node: the headline
            being stuck invisible turned out to be the Animated.parallel
            conflict described below, not the text node, but wrapping is the
            sturdier form so it stayed. */}
        <Animated.View style={[styles.headerBlock, revealStyle(reveal.title)]}>
          <Text style={styles.headerTitle}>How it Works</Text>
          <Text style={styles.headerSubtitle}>
            Give to a charity you love. Get discounts where you already shop.
          </Text>
        </Animated.View>

        <View style={styles.infoCard}>
          {/* Nonprofit Badge - Clickable Video Link */}
          <TouchableOpacity style={styles.nonprofitBadge} onPress={handleWatchVideo}>
            <Image 
              source={require('../../assets/icons/play.png')} 
              style={{ width: 16, height: 16, tintColor: '#fff', marginRight: 8 }} 
            />
            <Text style={styles.nonprofitText}>Our Mission Video</Text>
          </TouchableOpacity>

          {/* Main Headline */}
          {/* Key Benefits */}
          <View style={styles.benefitsContainer}>
            <Animated.View
              style={[styles.benefitCard, revealStyle(reveal.cards[0])]}
            >
              <View style={styles.benefitIcon}>
                <Image 
                  source={require('../../assets/icons/gift.png')} 
                  style={{ width: 24, height: 24, tintColor: '#DB8633' }} 
                />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>100% to Your Charity</Text>
                <Text style={styles.benefitDescription}>
                  Every dollar of your monthly gift goes to the charity you choose
                </Text>
              </View>
            </Animated.View>

            <Animated.View
              style={[styles.benefitCard, revealStyle(reveal.cards[1])]}
            >
              <View style={styles.benefitIcon}>
                <Image
                  source={require('../../assets/icons/discounts.png')}
                  style={{ width: 24, height: 24, tintColor: '#DB8633' }}
                />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Get Local Discounts</Text>
                <Text style={styles.benefitDescription}>
                  Get exclusive discounts from amazing local partners as a thank you
                </Text>
              </View>
              <CoinRain run={burst.coins} width={CARD_INNER_WIDTH} fall={150} />
            </Animated.View>

            <Animated.View
              style={[styles.benefitCard, revealStyle(reveal.cards[2])]}
            >
              <View style={styles.benefitIcon}>
                <Image
                  source={require('../../assets/icons/calendar.png')}
                  style={{ width: 24, height: 24, tintColor: '#DB8633' }}
                />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Monthly Impact</Text>
                <Text style={styles.benefitDescription}>
                  {monthlyImpactCopy(params?.flow)}
                </Text>
              </View>
              <HeartPop run={burst.hearts} width={CARD_INNER_WIDTH} rise={86} />
            </Animated.View>
          </View>

        </View>
      </ScrollView>

      {/* Confetti for the first card. Outside the ScrollView because a
          ScrollView clips its children, which would cut the burst off at the
          card edges. pointerEvents none so it never eats a tap. */}
      {burst.confetti && (
        <View pointerEvents="none" style={styles.confettiLayer}>
          <ConfettiCannon
            count={70}
            origin={{ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.34 }}
            fadeOut
            explosionSpeed={340}
            fallSpeed={2400}
            colors={['#DB8633', '#F2B471', '#2F4E58', '#4CA1AF', '#FFD9A8']}
          />
        </View>
      )}

      {/* Sticky Button at Bottom */}
      <View style={styles.stickyButtonContainer}>
        {/* <View style={styles.buttonIndicator}>
          <Text style={styles.buttonIndicatorText}>Next Step</Text>
        </View> */}
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Show Me the Discounts →</Text>
        </TouchableOpacity>
      </View>

      {/* Video Modal */}
      <Modal
        visible={showVideo}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closeVideo}
      >
        <View style={styles.videoModalContainer}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={closeVideo}>
            {Platform.OS === 'web' ? (
              <Text style={{ fontSize: 24, color: '#fff' }}>✕</Text>
            ) : (
              <AntDesign name="close" size={24} color="#fff" />
            )}
          </TouchableOpacity>

          {/* Video Player */}
          <Video
            ref={videoRef}
            style={styles.videoPlayer}
            source={{ uri: DONATION_VIDEO_URL }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            isLooping={false}
            isMuted={false}
            volume={1.0}
            onLoad={async () => {
              console.log('Video loaded, attempting to play');
              if (videoRef.current) {
                try {
                  await videoRef.current.playAsync();
                  console.log('Video auto-played successfully');
                } catch (error) {
                  console.log('Error auto-playing video:', error);
                }
              }
            }}
            onError={(error) => {
              console.log('Video error:', error);
              Alert.alert(
                'Video Error',
                'Unable to load the video. Please check your internet connection and try again.',
                [{ text: 'OK', onPress: closeVideo }]
              );
            }}
          />

          {/* Video Title */}
          <View style={styles.videoTitleContainer}>
            <Text style={styles.videoTitle}>Our Mission</Text>
            <Text style={styles.videoSubtitle}>A short look at why THRIVE exists and who it helps</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    height: SCREEN_HEIGHT * 0.45, 
    zIndex: 0, 
    overflow: 'hidden' 
  },
  gradientBg: { 
    width: SCREEN_WIDTH, 
    height: '100%', 
    borderBottomLeftRadius: 40, 
    borderBottomRightRadius: 40 
  },
  scrollView: {
    flex: 1,
  },
  backButton: BACK_BUTTON,
  backIcon: BACK_ICON,
  contentSection: {
    // flexGrow makes this fill the scroll viewport so justifyContent has room
    // to work; without it the container hugs the card and centring does
    // nothing. Still scrolls normally if the card ever grows past the screen.
    flexGrow: 1,
    alignItems: 'center',
    // Deliberately NOT justifyContent: 'center'. Centring this container
    // centred the title and the card together as one group, which made the
    // headline's position depend on how tall the card happened to be. It
    // landed about 30pt lower than the same headline on the discounts teaser
    // and the charity picker, so this screen read as misaligned against the
    // rest of signup.
    //
    // 44 is the number the other gradient headers use (discountTeaser's
    // brandHeader, chooseCause's gradientHeader), so every H1 in the flow now
    // sits at the same offset. The card still centres, via auto margins below,
    // in whatever space is left under the title.
    paddingTop: 44,
    // Clearance for the sticky button, which also pulls the centre point up so
    // the card sits in the middle of the area the donor can actually see
    // rather than the middle of the screen. Trimmed with the button's own
    // padding to cut the band of white between the two.
    paddingBottom: 84,
    zIndex: 5,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: CARD_PAD,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    // 90% of a 402pt screen is ~362, so 360 lets the card actually reach the
    // 90% it asks for instead of being capped well short of it.
    maxWidth: CARD_MAX_WIDTH,
    alignSelf: 'center',
    alignItems: 'center',
    // Centres the card in the space below the pinned title, rather than the
    // container centring title-and-card as one group. Auto margins collapse to
    // 0 if the card ever outgrows the viewport, so it just scrolls normally.
    marginTop: 'auto',
    marginBottom: 'auto',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nonprofitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DB8633',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 24,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  nonprofitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // White type on the gradient. Matches the weight and centring used by the
  // discounts teaser so the two screens read as the same family.
  headerBlock: {
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  // 22/800, matching discountTeaser, chooseCause and the charity list. This
  // was 30/bold, the largest of the four gradient headers, so the type size
  // changed as a donor moved from this screen to the next.
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  benefitsContainer: {
    width: '100%',
    // `gap` rather than marginBottom on each card, so the spacing lands
    // *between* the three and never after the last one. With margins the third
    // card contributed its own trailing gap on top of the card's 24 padding,
    // which is the unexplained white this used to try to cancel out.
    gap: 26,
    // No bottom margin: the card's own padding is the only gap wanted under
    // the last benefit.
    marginBottom: 0,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    padding: BENEFIT_PAD,
    borderRadius: 12,
    // Spacing between the three is benefitsContainer's `gap`, not a margin
    // here, so the last card doesn't add a trailing one.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    // Taller so the three cards fill the white card rather than leaving it
    // floating in empty gradient above and white below.
    minHeight: 104,
  },
  benefitIcon: {
    backgroundColor: '#FFF5EB',
    borderRadius: 12,
    padding: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DB8633',
    width: 44, // Fixed width for icon container
    height: 44, // Fixed height for icon container
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0, // Ensure text can wrap properly
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a202c', // Darker color for better contrast
    marginBottom: 3,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#4a5568', // Darker color for better contrast
    lineHeight: 20,
  },
  // Sits above the card but below the sticky button, and never intercepts
  // touches.
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  stickyButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    // These four match discountTeaser's stickyCTA exactly. They had drifted
    // (24 / 12 / 12), which inset this button 4px further on each side and sat
    // it 12px lower than the one on the very next screen.
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  buttonIndicator: {
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonIndicatorText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Video Modal Styles
  videoModalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },
  videoPlayer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
    backgroundColor: '#000',
  },
  videoTitleContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  videoTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  videoSubtitle: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});
