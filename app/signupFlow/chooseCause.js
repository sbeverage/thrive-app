/**
 * How do you want to pick a cause?
 *
 * The audit found the cause picker was where signup stalled: fifty two
 * charities, ordered alphabetically, with nothing on the card to judge them
 * by and no hint the choice could ever be changed. This screen sits in front
 * of that list and offers two ways out of the stall, which is what donors
 * actually need.
 *
 *   Help me choose      three causes instead of fifty two, rerollable
 *   Start now, pick later   give today, choose when you are ready
 *
 * There is a third, quieter route to the full list, because someone who
 * arrives knowing exactly what they care about should not be forced through a
 * game. Search now matches descriptions and categories, so that person is
 * well served by browsing.
 *
 * One screen with phases rather than three screens, so the whole thing feels
 * like one moment instead of a wizard.
 */
import React, { useCallback, useEffect, useState } from 'react';
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
import API from '../lib/api';
import {
  useBeneficiary,
  resolveBeneficiaryLogoSource,
} from '../context/BeneficiaryContext';
import { persistSignupFlowCheckpointFromParams } from '../utils/signupFlowCheckpoint';
import ChoosingAnimation from '../components/ChoosingAnimation';
import { pickTrio, hasUnseen, blurbFor } from '../utils/causePicker';

/**
 * `preview` is for the development-only route outside signupFlow/. That stack
 * is guarded by its own layout, which sends anyone without a session back to
 * the welcome screen, so the picker cannot be reviewed in place without
 * signing in. Rendering this component from an unguarded dev route is the way
 * to look at it without weakening that guard. In preview it also skips writing
 * a signup checkpoint, which would otherwise leave a resume marker behind and
 * redirect the next launch.
 */
export default function ChooseCause({ preview = false } = {}) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { setSelectedBeneficiary, setHoldingForChoice } = useBeneficiary();

  const flow = Array.isArray(params?.flow) ? params.flow[0] : params?.flow;
  const sponsorAmount = Array.isArray(params?.sponsorAmount)
    ? params.sponsorAmount[0]
    : params?.sponsorAmount;

  const [phase, setPhase] = useState('entry'); // entry | animating | trio
  const [charities, setCharities] = useState([]);
  const [trio, setTrio] = useState([]);
  const [seen, setSeen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [rerolled, setRerolled] = useState(false);

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

  const rollTrio = useCallback(() => {
    const next = pickTrio(charities, seen, 3);
    setTrio(next);
    setSeen((prev) => {
      const merged = new Set(prev);
      next.forEach((c) => merged.add(c.id));
      return merged;
    });
  }, [charities, seen]);

  const startHelpMeChoose = useCallback(() => {
    if (charities.length === 0) return;
    rollTrio();
    setRerolled(false);
    setPhase('animating');
  }, [charities.length, rollTrio]);

  const reroll = useCallback(() => {
    rollTrio();
    setRerolled(true);
    setPhase('animating');
  }, [rollTrio]);

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

  const browseAll = useCallback(() => {
    const next = { pathname: '/signupFlow/beneficiarySignupCause', params: {} };
    if (flow === 'team') next.params = { flow: 'team' };
    else if (flow === 'coworking') {
      next.params = { flow: 'coworking', sponsorAmount: String(sponsorAmount ?? '15') };
    }
    router.push(next);
  }, [flow, router, sponsorAmount]);

  // ------------------------------------------------------------- rendering

  if (phase === 'animating') {
    return (
      <View style={styles.container}>
        <View style={styles.centreFill}>
          <ChoosingAnimation
            quick={rerolled}
            label={rerolled ? 'Three more coming up' : 'Finding causes for you'}
            onDone={() => setPhase('trio')}
          />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {phase === 'entry' ? (
        <>
          <Text style={styles.title}>Who do you want to help?</Text>
          <Text style={styles.sub}>
            There are {loading ? 'dozens of' : charities.length} causes on THRIVE. You
            can change yours anytime, so there is no wrong answer here.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={startHelpMeChoose}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Help me choose</Text>
                <Text style={styles.primaryBtnSub}>See three, not fifty two</Text>
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
                  We hold your first gift until you choose
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={browseAll} accessibilityRole="button">
            <Text style={styles.quietLink}>
              Or browse all {loading ? '' : `${charities.length} `}causes
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>How about one of these?</Text>
          <Text style={styles.sub}>
            Three causes, picked across different kinds of work. Tap one to make it
            yours.
          </Text>

          {trio.map((c) => {
            const blurb = blurbFor(c);
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
                </View>

                {!!blurb && (
                  <Text style={styles.cardBlurb} numberOfLines={3}>
                    {blurb}
                  </Text>
                )}

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

          <TouchableOpacity
            style={styles.rerollBtn}
            onPress={reroll}
            disabled={!!busyId}
            accessibilityRole="button"
          >
            <Text style={styles.rerollText}>Shake the piggy</Text>
            <Text style={styles.rerollSub}>
              {hasUnseen(charities, seen, 3)
                ? 'Three new causes'
                : 'Start the causes over'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={browseAll} accessibilityRole="button">
            <Text style={styles.quietLink}>Or browse all {charities.length} causes</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 48 },
  centreFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2F4E58',
    textAlign: 'center',
    lineHeight: 32,
  },
  sub: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6d6e72',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 26,
  },

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
  primaryBtnSub: { color: '#FCEBD8', fontSize: 13, marginTop: 3 },

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

  btnDisabled: { opacity: 0.6 },

  quietLink: {
    color: '#8a9ba1',
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 10,
  },

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

  chooseBtn: {
    backgroundColor: '#DB8633',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
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
