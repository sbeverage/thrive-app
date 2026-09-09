/**
 * How do you want to pick a cause?
 *
 * The audit found the cause picker was where signup stalled: a long
 * alphabetical list, nothing on the card to judge a charity by, and no hint
 * the choice could ever be changed. This screen sits in front of that list
 * and offers two ways out of the stall.
 *
 *   Help me choose         narrow it down, a few at a time
 *   Start now, pick later  give today, choose when you are ready
 *
 * Four phases on one screen rather than four screens, so it reads as one
 * moment instead of a wizard:
 *
 *   entry       the two choices, with nothing competing with them
 *   categories  pick as many as matter to you, then we filter
 *   trio        three causes, rerollable
 *
 * Deliberately no counts anywhere. Not "52 causes", not "6 in Animal
 * Welfare". The catalogue is meant to grow, a number dates the copy the
 * moment a charity joins, and quantifying a young catalogue makes it look
 * small rather than curated.
 *
 * There is still a quiet route to the full list, because someone who arrives
 * knowing exactly what they care about should not be made to play a game, and
 * search now matches descriptions and categories so browsing works for them.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API from '../lib/api';
import {
  useBeneficiary,
  resolveBeneficiaryLogoSource,
} from '../context/BeneficiaryContext';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';
import { pickTrio, hasUnseen, blurbFor } from '../utils/causePicker';
import { categoryKey, categoryLabel, orderCategoryKeys } from '../utils/categories';

// Same key the beneficiary list screen uses, so a heart tapped here shows as
// saved there and the other way round. Charity favourites are local only;
// there is no server side for them, unlike vendor favourites.
const FAVORITES_KEY = 'beneficiaryFavorites';

/**
 * `preview` is for the development-only route outside signupFlow/. That stack
 * is guarded by its own layout, which sends anyone without a session back to
 * the welcome screen, so the picker cannot be reviewed in place without
 * signing in. Rendering this component from an unguarded dev route is how to
 * look at it without weakening that guard. In preview it also skips writing a
 * signup checkpoint, which would otherwise leave a resume marker behind and
 * redirect the next launch.
 */
export default function ChooseCause({ preview = false } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { setSelectedBeneficiary, setHoldingForChoice } = useBeneficiary();

  const flow = Array.isArray(params?.flow) ? params.flow[0] : params?.flow;
  const sponsorAmount = Array.isArray(params?.sponsorAmount)
    ? params.sponsorAmount[0]
    : params?.sponsorAmount;
  /**
   * Which step to open on. The full list's "Help me choose" sends
   * start=categories, because someone who tapped Help me choose there has
   * already made that choice. Landing them on a screen offering Help me
   * choose again is a tap that answers a question they just answered.
   */
  const startParam = Array.isArray(params?.start) ? params.start[0] : params?.start;

  const [phase, setPhase] = useState(
    startParam === 'categories' ? 'categories' : 'entry',
  ); // entry | categories | trio
  const [charities, setCharities] = useState([]);
  const [trio, setTrio] = useState([]);
  const [seen, setSeen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [favorites, setFavorites] = useState([]);
  // Any number of categories. Empty means "anything".
  const [picked, setPicked] = useState([]);

  const paramsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    if (preview) return;
    persistSignupFlowCheckpointFromParams('/signupFlow/chooseCause', params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, preview]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await API.getCharities();
      const list = res?.charities || res?.data || (Array.isArray(res) ? res : []);
      if (!cancelled) {
        setCharities(Array.isArray(list) ? list : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(FAVORITES_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavorites(parsed);
      })
      .catch(() => {
        /* a missing or malformed cache just means no favourites yet */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The heart saves without choosing. Two actions on one card means the
   * distinction has to be obvious, so the heart never navigates and
   * "Choose this cause" is the only thing that commits.
   */
  const toggleFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {
        /* the heart still reflects the tap even if the write fails */
      });
      return next;
    });
  }, []);

  /** Categories that actually have charities in them. No counts shown. */
  const categories = useMemo(() => {
    const keys = new Set();
    for (const c of charities) {
      const k = categoryKey(c.category);
      if (k) keys.add(k);
    }
    return orderCategoryKeys([...keys]).map((k) => ({ key: k, label: categoryLabel(k) }));
  }, [charities]);

  /**
   * The charities the trio is drawn from. Everything about the reroll depends
   * on this rather than on the whole catalogue, which is where the bug was:
   * hasUnseen was checking all 52, so picking a narrow category left the
   * button promising "different causes each time" when there were none left.
   */
  const pool = useMemo(
    () =>
      picked.length > 0
        ? charities.filter((c) => picked.includes(categoryKey(c.category)))
        : charities,
    [charities, picked],
  );

  // Seven categories hold three charities or fewer, and one holds a single
  // charity. In those the reroll can never change anything, so it must not
  // pretend to: offering it would be a button that visibly does nothing.
  const canReroll = pool.length > 3;
  const exhausted = !hasUnseen(pool, seen, 3);

  const togglePicked = useCallback((key) => {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  /** Where a donor goes once a cause is settled. Mirrors the list screen. */
  const continueAfterPick = useCallback(
    (beneficiaryId) => {
      if (flow === 'team') {
        router.push({ pathname: '/signupFlow/teamAccountReady', params: { flow: 'team' } });
        return;
      }
      if (flow === 'coworking') {
        router.push({
          pathname: '/signupFlow/coworkingDonationPrompt',
          params: { sponsorAmount: String(sponsorAmount ?? '15') },
        });
        return;
      }
      router.push({
        pathname: '/signupFlow/donationAmount',
        params: beneficiaryId ? { beneficiaryId: String(beneficiaryId) } : {},
      });
    },
    [flow, router, sponsorAmount],
  );

  const rollTrio = useCallback(
    (withCategories = picked) => {
      const pool =
        withCategories.length > 0
          ? charities.filter((c) => withCategories.includes(categoryKey(c.category)))
          : charities;
      const next = pickTrio(pool, seen, 3);
      setTrio(next);
      setSeen((prev) => {
        const merged = new Set(prev);
        next.forEach((c) => merged.add(c.id));
        return merged;
      });
    },
    [charities, picked, seen],
  );

  const showTrio = useCallback(
    (withCategories = picked) => {
      if (charities.length === 0) return;
      rollTrio(withCategories);
      setPhase('trio');
    },
    [charities.length, picked, rollTrio],
  );

  // Rerolling swaps the three cards in place. There is no loading beat: the
  // charities are already in memory, so anything shown between the tap and
  // the cards would be a delay we invented rather than one we have.
  //
  // Once the pool is used up, clear `seen` and draw fresh rather than letting
  // pickTrio quietly fall back to the full pool. Without the reset `seen`
  // keeps growing, hasUnseen stays false forever, and every later tap looks
  // like a button doing nothing.
  const reroll = useCallback(() => {
    if (exhausted) {
      const next = pickTrio(pool, new Set(), 3);
      setTrio(next);
      setSeen(new Set(next.map((c) => c.id)));
      return;
    }
    rollTrio();
  }, [exhausted, pool, rollTrio]);

  const choose = useCallback(
    async (charity) => {
      if (busyId) return;
      setBusyId(charity.id);
      try {
        await API.saveProfile({ beneficiary: charity.id });
      } catch (e) {
        console.warn('Could not save cause:', e?.message || e);
      }
      setSelectedBeneficiary(charity);
      setHoldingForChoice(false);
      setBusyId(null);
      continueAfterPick(charity.id);
    },
    [busyId, continueAfterPick, setHoldingForChoice, setSelectedBeneficiary],
  );

  /**
   * Give now, choose later. The gift is held against THRIVE until the donor
   * picks, which the backend already supports: held_for_donor_choice on the
   * donation and redirectHeldDonations to release it.
   */
  const startNowPickLater = useCallback(async () => {
    if (holdBusy) return;
    setHoldBusy(true);
    try {
      const thrive = await API.getThriveCharity();
      if (!thrive?.id) {
        Alert.alert(
          'Not available right now',
          "We couldn't set that up. Pick a cause instead and you can always change it.",
        );
        setHoldBusy(false);
        return;
      }
      await setHoldingForChoice(true);
      try {
        await API.saveProfile({ beneficiary: thrive.id });
      } catch (e) {
        console.warn('Could not save held cause:', e?.message || e);
      }
      setSelectedBeneficiary({ ...thrive, _saveMySpot: true });
      setHoldBusy(false);
      continueAfterPick(thrive.id);
    } catch (e) {
      console.warn('start now, pick later failed:', e?.message || e);
      setHoldBusy(false);
      Alert.alert('Something went wrong', 'Give that another try in a moment.');
    }
  }, [continueAfterPick, holdBusy, setHoldingForChoice, setSelectedBeneficiary]);

  /**
   * The full profile. Each charity has whyThisMatters, a success story and
   * impact statements filled in, and the card shows none of them, so three
   * truncated lines is thin grounds for committing to a monthly gift.
   *
   * Params match detailParamsFor in the list screen, including forwarding the
   * comped flow. Without `flow` a team account arrives at the detail screen
   * indistinguishable from a standard donor and gets routed to the payment
   * step, which is exactly the bug fixed in 30349c6.
   */
  const learnMore = useCallback(
    (charity) => {
      const next = {
        pathname: '/signupFlow/beneficiaryDetail',
        // returnTo makes the profile's back button come back here, to these
        // same three cards, instead of replacing with the full list.
        params: { id: String(charity.id), fromSignup: 'true', returnTo: 'picker' },
      };
      if (flow === 'team') next.params.flow = 'team';
      else if (flow === 'coworking') {
        next.params.flow = 'coworking';
        next.params.sponsorAmount = String(sponsorAmount ?? '15');
      }
      router.push(next);
    },
    [flow, router, sponsorAmount],
  );

  const browseAll = useCallback(() => {
    const next = { pathname: '/signupFlow/beneficiarySignupCause', params: {} };
    if (flow === 'team') next.params = { flow: 'team' };
    else if (flow === 'coworking') {
      next.params = { flow: 'coworking', sponsorAmount: String(sponsorAmount ?? '15') };
    }
    router.push(next);
  }, [flow, router, sponsorAmount]);

  // ------------------------------------------------------------- rendering

  /**
   * Every phase wears the home tab's shell: the #2C3E50 to #4CA1AF gradient
   * with a 24pt bottom radius, over an #F5F5F5 ground, with the content
   * lifted up into the gradient. Numbers taken from home.js so the screens
   * match rather than merely resemble each other.
   *
   * A plain function, not a component. As a component this would be a new
   * type on every render and React would unmount and remount the whole
   * subtree, losing chip selections and scroll position on every keystroke
   * of state.
   */
  const shell = (title, sub, children) => (
    <View style={styles.gradientPage}>
      <ScrollView
        contentContainerStyle={styles.gradientScroll}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientHeader, { paddingTop: insets.top + 20 }]}
        >
          <Text style={styles.gradientTitle}>{title}</Text>
          <Text style={styles.gradientSub}>{sub}</Text>
        </LinearGradient>
        {children}
      </ScrollView>
    </View>
  );

  if (phase === 'entry') {
    return shell(
      'Who do you want to help?',
      'You can change your cause anytime, so there is no wrong answer here.',
      <>
        <View style={styles.overlapCard}>
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={() => setPhase('categories')}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Help me choose</Text>
                <Text style={styles.primaryBtnSub}>We will narrow it down for you</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, holdBusy && styles.btnDisabled]}
            onPress={startNowPickLater}
            disabled={holdBusy}
            accessibilityRole="button"
          >
            {holdBusy ? (
              <ActivityIndicator color="#324E58" />
            ) : (
              <>
                <Text style={styles.secondaryBtnText}>Start now, pick later</Text>
                <Text style={styles.secondaryBtnSub}>
                  We hold your donation until you choose
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.ctaWrap}>
          <TouchableOpacity onPress={browseAll} accessibilityRole="button">
            <Text style={styles.quietLink}>Or browse all causes</Text>
          </TouchableOpacity>
        </View>
      </>,
    );
  }

  if (phase === 'categories') {
    return shell(
      'What matters to you?',
      "Select as many categories you care about to discover charities you'd like to donate to.",
      <>
        <View style={styles.overlapCard}>
          <View style={styles.chips}>
            {categories.map((c) => {
              const on = picked.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => togglePicked(c.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={c.label}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Sits well clear of the card so the choice and the commit are not
            crowded into each other. */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={[styles.primaryBtn, picked.length === 0 && styles.btnDisabled]}
            onPress={() => showTrio(picked)}
            disabled={picked.length === 0}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Show me causes</Text>
            <Text style={styles.primaryBtnSub}>
              {picked.length === 0
                ? 'Pick at least one to continue'
                : 'A few at a time, so it stays easy'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => showTrio([])} accessibilityRole="button">
            <Text style={styles.quietLink}>Not sure yet, surprise me</Text>
          </TouchableOpacity>
        </View>
      </>,
    );
  }

  return shell(
    'How about one of these?',
    canReroll || picked.length === 0
      ? 'Tap the heart to save one for later, or choose it now.'
      : 'That is every cause in what you picked. Add more to see others.',
    <>
      {/* The charity cards are already white cards, so they lift into the
          gradient directly rather than sitting inside another card. Nesting
          white on white would flatten them. */}
      <View style={styles.trioList}>
        {trio.map((c) => {
          const blurb = blurbFor(c);
          const saved = favorites.includes(c.id);
          return (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Image
                  source={resolveBeneficiaryLogoSource(c)}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <View style={styles.cardHead}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {c.name}
                  </Text>
                  {!!c.category && <Text style={styles.cardCat}>{c.category}</Text>}
                </View>
                <TouchableOpacity
                  style={styles.heartBtn}
                  onPress={() => toggleFavorite(c.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    saved ? `Remove ${c.name} from saved` : `Save ${c.name} for later`
                  }
                >
                  <Image
                    source={
                      saved
                        ? require('../../assets/images/heart.png')
                        : require('../../assets/icons/heart.png')
                    }
                    style={[styles.heartIcon, { tintColor: saved ? '#DB8633' : '#C3D1D6' }]}
                  />
                </TouchableOpacity>
              </View>

              {!!blurb && (
                <Text style={styles.cardBlurb} numberOfLines={3}>
                  {blurb}
                </Text>
              )}

              {/* A link rather than a second button, on purpose. Two equal
                  buttons per card is six buttons on this screen, which
                  quietly rebuilds the paralysis the screen exists to remove.
                  One obvious action, one quiet way to read more. */}
              <TouchableOpacity
                onPress={() => learnMore(c)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel={`Learn more about ${c.name}`}
              >
                <Text style={styles.learnMore}>Learn more</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chooseBtn, busyId === c.id && styles.btnDisabled]}
                onPress={() => choose(c)}
                disabled={!!busyId}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${c.name}`}
              >
                {busyId === c.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.chooseBtnText}>Choose this cause</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.ctaWrap}>
        {/* Three states, because a reroll that cannot change anything has to
            say so rather than look broken. Nothing to reroll at all, nothing
            new left this round, or business as usual. */}
        {!canReroll ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setPhase('categories')}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Add more categories</Text>
            <Text style={styles.primaryBtnSub}>
              {pool.length === 1
                ? 'There is only one cause here'
                : `There are only ${pool.length} causes here`}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.rerollBtn}
            onPress={reroll}
            disabled={!!busyId}
            accessibilityRole="button"
          >
            <Text style={styles.rerollText}>
              {exhausted ? 'Start over' : 'Show me 3 more'}
            </Text>
            <Text style={styles.rerollSub}>
              {exhausted
                ? 'You have seen them all, going back to the top'
                : 'Different causes each time'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => setPhase('categories')} accessibilityRole="button">
          <Text style={styles.quietLink}>Change what matters to you</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={browseAll} accessibilityRole="button">
          <Text style={styles.quietLink}>Or browse all causes</Text>
        </TouchableOpacity>
      </View>
    </>,
  );
}

const styles = StyleSheet.create({


  primaryBtn: {
    backgroundColor: '#DB8633',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 68,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  primaryBtnSub: { color: '#FCEBD8', fontSize: 13, marginTop: 3, textAlign: 'center' },

  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: '#324E58',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 18,
    minHeight: 68,
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#324E58', fontSize: 17, fontWeight: '700' },
  secondaryBtnSub: { color: '#6d6e72', fontSize: 13, marginTop: 3, textAlign: 'center' },

  btnDisabled: { opacity: 0.55 },

  quietLink: {
    color: '#8a9ba1',
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 10,
  },

  // ---- the home tab treatment, for the categories step ----
  gradientPage: { flex: 1, backgroundColor: '#F5F5F5' },
  gradientScroll: { paddingBottom: 40 },
  gradientHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 28,
    // Deep enough that the card below can lift into it without covering
    // the heading.
    paddingBottom: 104,
    overflow: 'hidden',
  },
  gradientTitle: {
    fontSize: 27,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
  },
  gradientSub: {
    fontSize: 15,
    lineHeight: 22,
    color: '#DCEFF3',
    textAlign: 'center',
    marginTop: 10,
  },
  overlapCard: {
    marginTop: -80,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 22,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  ctaWrap: { marginTop: 24, paddingHorizontal: 24 },
  trioList: { marginTop: -80, paddingHorizontal: 16, zIndex: 10 },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 11,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#D8E4E7',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#F7FBFC',
  },
  chipOn: { borderColor: '#DB8633', backgroundColor: '#DB8633' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#2F4E58' },
  chipTextOn: { color: '#fff' },

  heartBtn: { paddingLeft: 10, paddingTop: 2 },
  heartIcon: { width: 22, height: 22, resizeMode: 'contain' },

  card: {
    borderWidth: 1,
    borderColor: '#E1EAEC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: '#F2F7F8',
  },
  cardHead: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#2F4E58', lineHeight: 21 },
  cardCat: { fontSize: 12.5, color: '#8a9ba1', marginTop: 2 },
  cardBlurb: { fontSize: 13.5, lineHeight: 19, color: '#6d6e72', marginTop: 10 },

  learnMore: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#31788A',
    marginTop: 10,
    textDecorationLine: 'underline',
  },
  chooseBtn: {
    backgroundColor: '#DB8633',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  chooseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  rerollBtn: {
    borderWidth: 1.5,
    borderColor: '#DB8633',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  rerollText: { color: '#DB8633', fontSize: 16, fontWeight: '700' },
  rerollSub: { color: '#B98A5A', fontSize: 12.5, marginTop: 2 },
});
