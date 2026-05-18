// components/InviteFriendsModal.js

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  Alert,
  Platform,
  Dimensions,
  TextInput,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign, Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useUser } from '../app/context/UserContext';
import API from '../app/lib/api';
import {
  REFERRAL_TIERS,
  milestonesForDisplay,
  nextMilestoneFromPaidCount,
  tiersUnlockedCount,
} from '../app/constants/referralRewards';
import { BADGE_ASSETS } from '../app/utils/assetConstants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MILESTONE_BADGE_IMAGES = [
  BADGE_ASSETS.SUPPORTER,
  BADGE_ASSETS.SPOTLIGHT,
  BADGE_ASSETS.CHAMPION,
];
const MILESTONE_BADGE_IMAGES_LOCKED = [
  BADGE_ASSETS.SUPPORTER_LOCKED,
  BADGE_ASSETS.SPOTLIGHT_LOCKED,
  BADGE_ASSETS.CHAMPION_LOCKED,
];

export default function InviteFriendsModal({ visible, onClose }) {
  const { user } = useUser();
  const [referralLink, setReferralLink] = useState('');
  const [friendsCount, setFriendsCount] = useState(0);
  const [paidFriendsCount, setPaidFriendsCount] = useState(0);
  const [apiMilestones, setApiMilestones] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    if (visible) {
      loadReferralData();
    }
  }, [visible]);

  const loadReferralData = async () => {
    try {
      setLoading(true);
      // Try to get referral data from API
      const data = await API.getReferralInfo();
      
      if (data && data.referralLink) {
        setReferralLink(data.referralLink);
      } else {
        // Generate referral link if API doesn't return one
        const userId = user?.id || user?.email?.split('@')[0];
        if (userId) {
          const link = `https://thrive-web-jet.vercel.app/signup?ref=${encodeURIComponent(userId)}`;
          setReferralLink(link);
        } else {
          setReferralLink('');
        }
      }
      
      // Use paidFriendsCount from API, fallback to friendsCount
      const actualPaidFriendsCount = data?.paidFriendsCount ?? data?.friendsCount ?? 0;
      setPaidFriendsCount(actualPaidFriendsCount);
      setFriendsCount(data?.friendsCount || 0);
      setApiMilestones(data?.milestones || []);
      
      // Load friends list
      try {
        const friendsData = await API.getReferredFriends();
        setFriendsList(friendsData?.friends || []);
      } catch (error) {
        console.error('Error loading friends list:', error);
        setFriendsList([]);
      }
    } catch (error) {
      console.error('Error loading referral data:', error);
      // Fallback: generate referral link only if we have a valid user identifier
      const userId = user?.id || user?.email?.split('@')[0];
      if (userId) {
        const link = `https://thrive-web-jet.vercel.app/signup?ref=${encodeURIComponent(userId)}`;
        setReferralLink(link);
      } else {
        setReferralLink('');
      }
      setPaidFriendsCount(0);
      setFriendsCount(0);
      setApiMilestones([]);
      setFriendsList([]);
    } finally {
      setLoading(false);
    }
  };

  const buildInviteMessage = () =>
    `Join me on Thrive! Together we can make a real difference in our community. Get exclusive discounts from local businesses while supporting amazing causes. Sign up here: ${referralLink}`;

  const handleCopyLink = async () => {
    if (!referralLink) {
      Alert.alert('Please wait', 'Your referral link is still loading.');
      return;
    }
    try {
      await Clipboard.setStringAsync(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying link:', error);
      Alert.alert('Referral Link', referralLink, [{ text: 'OK' }]);
    }
  };

  const handleShareInvite = async () => {
    if (!referralLink) {
      Alert.alert('Please wait', 'Your referral link is still loading.');
      return;
    }
    const message = buildInviteMessage();
    const title = 'Join Thrive with me!';
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message, title, url: referralLink }
          : { message, title }
      );
    } catch (error) {
      console.error('Error sharing invite:', error);
      Alert.alert('Error', 'Failed to share. Please try again.');
    }
  };

  const milestones = milestonesForDisplay(apiMilestones, paidFriendsCount);
  const nextMilestone = nextMilestoneFromPaidCount(paidFriendsCount, milestones);
  const unlockedTierCount = tiersUnlockedCount(milestones);
  const finalTierCount = REFERRAL_TIERS[REFERRAL_TIERS.length - 1].count;
  const allTiersDone = paidFriendsCount >= finalTierCount;
  const progress = allTiersDone
    ? 100
    : Math.min(
        100,
        (paidFriendsCount / Math.max(1, nextMilestone.count)) * 100
      );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <Text style={styles.title}>Grow Your Impact</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <AntDesign name="close" size={20} color="#324E58" />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>
                Invite friends so more support reaches the causes you care about.
              </Text>
            </View>

            {/* Stats Card */}
            <View style={styles.statsCard}>
              <LinearGradient
                colors={['#DB8633', '#F4A261']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statsGradient}
              >
                <View style={styles.statsContent}>
                  <Text style={styles.statsNumber}>{paidFriendsCount}</Text>
                  <Text style={styles.statsLabel}>Friends Making{'\n'}a Difference</Text>
                </View>
                <View style={styles.statsDivider} />
                <View style={styles.statsContent}>
                  <Text style={styles.statsNumber}>
                    {unlockedTierCount}/{REFERRAL_TIERS.length}
                  </Text>
                  <Text style={styles.statsLabel}>Recognition{'\n'}tiers unlocked</Text>
                </View>
              </LinearGradient>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel} numberOfLines={2}>
                  {allTiersDone
                    ? 'Every recognition tier unlocked'
                    : `Next: ${nextMilestone.reward}`}
                </Text>
                <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {allTiersDone
                  ? 'Thank you—your invites help us keep donations focused on real impact.'
                  : `${Math.max(0, nextMilestone.count - paidFriendsCount)} more ${nextMilestone.count - paidFriendsCount === 1 ? 'active friend' : 'active friends'} to unlock ${nextMilestone.reward}.`}
              </Text>
            </View>

            {/* Recognition badges earned */}
            {(() => {
              const earnedBadges = milestones
                .filter((m) => m.unlocked)
                .map((m) => ({
                  name: m.shortLabel || m.reward.replace(/ Badge$/i, '').trim(),
                  earnedAt: m.earnedAt,
                  milestone: m.count,
                }));

              if (earnedBadges.length === 0) return null;

              return (
                <View style={styles.badgesSection}>
                  <Text style={styles.sectionTitle}>Your recognition</Text>
                  <View style={styles.badgesContainer}>
                    {earnedBadges.map((badge, index) => (
                      <View key={`${badge.milestone}-${index}`} style={styles.badgeItem}>
                        <View style={styles.badgeIcon}>
                          <AntDesign name="star" size={28} color="#DB8633" />
                        </View>
                        <Text style={styles.badgeName}>{badge.name}</Text>
                        {badge.earnedAt ? (
                          <Text style={styles.badgeDate}>
                            {new Date(badge.earnedAt).toLocaleDateString()}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Referral link + share */}
            <View style={styles.referralSection}>
              <Text style={styles.sectionTitle}>Invite friends</Text>
              <View style={styles.referralLinkContainer}>
                <TextInput
                  style={styles.referralLink}
                  value={referralLink || 'Loading...'}
                  editable={false}
                  selectTextOnFocus
                  numberOfLines={1}
                />
              </View>
              <View style={styles.referralActions}>
                <TouchableOpacity
                  onPress={handleCopyLink}
                  disabled={!referralLink}
                  style={[
                    styles.referralActionButton,
                    styles.copyLinkButton,
                    copied && styles.copyLinkButtonCopied,
                    !referralLink && styles.referralActionButtonDisabled,
                  ]}
                >
                  <Feather
                    name={copied ? 'check' : 'copy'}
                    size={18}
                    color={copied ? '#fff' : '#DB8633'}
                  />
                  <Text
                    style={[
                      styles.copyLinkButtonText,
                      copied && styles.copyLinkButtonTextCopied,
                    ]}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShareInvite}
                  disabled={!referralLink}
                  style={[
                    styles.referralActionButton,
                    styles.shareInviteButton,
                    !referralLink && styles.referralActionButtonDisabled,
                  ]}
                >
                  <Feather name="share-2" size={18} color="#fff" />
                  <Text style={styles.shareInviteButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Milestones */}
            <View style={styles.milestonesSection}>
              <Text style={styles.sectionTitle}>Milestones</Text>
              <View style={styles.milestonesList}>
                {milestones.map((milestone, index) => {
                  const unlocked =
                    milestone.unlocked || paidFriendsCount >= milestone.count;
                  const badgeUri = unlocked
                    ? MILESTONE_BADGE_IMAGES[index]
                    : MILESTONE_BADGE_IMAGES_LOCKED[index];

                  return (
                  <View
                    key={index}
                    style={[
                      styles.milestoneItem,
                      unlocked && styles.milestoneItemUnlocked,
                    ]}
                  >
                    <View style={styles.milestoneIcon}>
                      <Image
                        source={{ uri: badgeUri }}
                        style={[
                          styles.milestoneBadgeImage,
                          !unlocked && styles.milestoneBadgeImageLocked,
                        ]}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.milestoneContent}>
                      <Text style={styles.milestoneCount}>{milestone.count} Friend{milestone.count > 1 ? 's' : ''} Joined</Text>
                      <Text style={styles.milestoneReward}>{milestone.reward}</Text>
                      {milestone.description && (
                        <Text style={styles.milestoneDescription}>{milestone.description}</Text>
                      )}
                      {milestone.earnedAt && (
                        <Text style={styles.milestoneEarnedDate}>Earned {new Date(milestone.earnedAt).toLocaleDateString()}</Text>
                      )}
                    </View>
                  </View>
                  );
                })}
              </View>
            </View>

            {/* Friends List */}
            {friendsList.length > 0 && (
              <View style={styles.friendsSection}>
                <Text style={styles.sectionTitle}>Friends You've Invited</Text>
                <View style={styles.friendsList}>
                  {friendsList.map((friend, index) => {
                    const getStatusColor = (status) => {
                      switch (status) {
                        case 'paid': return '#10B981';
                        case 'payment_setup': return '#F59E0B';
                        case 'signed_up': return '#3B82F6';
                        case 'pending': return '#9CA3AF';
                        case 'cancelled': return '#EF4444';
                        default: return '#9CA3AF';
                      }
                    };
                    
                    const getStatusLabel = (status) => {
                      switch (status) {
                        case 'paid': return 'Active';
                        case 'payment_setup': return 'Almost There';
                        case 'signed_up': return 'Joined';
                        case 'pending': return 'Invited';
                        case 'cancelled': return 'Inactive';
                        default: return 'Unknown';
                      }
                    };
                    
                    return (
                      <View key={friend.id || index} style={styles.friendItem}>
                        <View style={styles.friendInfo}>
                          <Text style={styles.friendName}>{friend.name || friend.email || 'Friend'}</Text>
                          {friend.email && friend.name && (
                            <Text style={styles.friendEmail}>{friend.email}</Text>
                          )}
                          {friend.monthlyDonation && (
                            <Text style={styles.friendDonation}>Giving ${friend.monthlyDonation}/month</Text>
                          )}
                          {friend.joinedAt && (
                            <Text style={styles.friendDate}>Joined {new Date(friend.joinedAt).toLocaleDateString()}</Text>
                          )}
                        </View>
                        <View style={[styles.friendStatus, { backgroundColor: getStatusColor(friend.status) + '20' }]}>
                          <View style={[styles.friendStatusDot, { backgroundColor: getStatusColor(friend.status) }]} />
                          <Text style={[styles.friendStatusText, { color: getStatusColor(friend.status) }]}>
                            {getStatusLabel(friend.status)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Benefits */}
            <View style={styles.benefitsSection}>
              <Text style={styles.sectionTitle}>Why invite friends?</Text>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <AntDesign name="heart" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Grow support for the causes you care about</Text>
                </View>
                <View style={styles.benefitItem}>
                  <AntDesign name="star" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Earn badges and a chance to be featured on our site</Text>
                </View>
                <View style={styles.benefitItem}>
                  <AntDesign name="team" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Build a community of people who give back locally</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: SCREEN_WIDTH - 40,
    maxHeight: '90%',
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTop: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
    minHeight: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 32,
  },
  closeButton: {
    padding: 4,
    position: 'absolute',
    right: 0,
    top: 2,
    zIndex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#7A8D9C',
    lineHeight: 20,
    textAlign: 'center',
    width: '100%',
  },
  statsCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  statsGradient: {
    flexDirection: 'row',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statsContent: {
    alignItems: 'center',
    flex: 1,
  },
  statsNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  statsLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  statsDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 20,
  },
  progressSection: {
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#324E58',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DB8633',
  },
  progressBar: {
    height: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#DB8633',
    borderRadius: 5,
  },
  progressText: {
    fontSize: 13,
    color: '#7A8D9C',
    textAlign: 'center',
  },
  milestonesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 16,
  },
  milestonesList: {
    gap: 12,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  milestoneItemUnlocked: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  milestoneIcon: {
    marginRight: 16,
  },
  milestoneBadgeImage: {
    width: 56,
    height: 56,
  },
  milestoneBadgeImageLocked: {
    opacity: 0.6,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 4,
  },
  milestoneReward: {
    fontSize: 14,
    color: '#7A8D9C',
    fontWeight: '600',
    marginTop: 2,
  },
  milestoneDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    lineHeight: 16,
  },
  milestoneEarnedDate: {
    fontSize: 11,
    color: '#10B981',
    marginTop: 4,
    fontWeight: '500',
  },
  friendsSection: {
    marginBottom: 24,
  },
  friendsList: {
    gap: 12,
  },
  friendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 4,
  },
  friendEmail: {
    fontSize: 13,
    color: '#7A8D9C',
    marginBottom: 4,
  },
  friendDonation: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
    marginBottom: 2,
  },
  friendDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  friendStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  friendStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  friendStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgesSection: {
    marginBottom: 24,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  badgeItem: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    minWidth: 90,
    borderWidth: 2,
    borderColor: '#DB8633',
    borderStyle: 'dashed',
  },
  badgeIcon: {
    marginBottom: 6,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 2,
  },
  badgeDate: {
    fontSize: 10,
    color: '#7A8D9C',
    textAlign: 'center',
  },
  badgeItemTest: {
    opacity: 0.6,
    borderColor: '#9CA3AF',
  },
  badgeNameTest: {
    color: '#9CA3AF',
  },
  testModeNote: {
    fontSize: 11,
    color: '#DB8633',
    fontStyle: 'italic',
    marginBottom: 8,
    textAlign: 'center',
  },
  referralSection: {
    marginBottom: 24,
  },
  referralLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  referralLink: {
    flex: 1,
    fontSize: 14,
    color: '#324E58',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  referralActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  referralActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
  },
  referralActionButtonDisabled: {
    opacity: 0.5,
  },
  copyLinkButton: {
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderColor: '#DB8633',
  },
  copyLinkButtonCopied: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  copyLinkButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DB8633',
  },
  copyLinkButtonTextCopied: {
    color: '#fff',
  },
  shareInviteButton: {
    backgroundColor: '#DB8633',
  },
  shareInviteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  benefitsSection: {
    marginBottom: 20,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#324E58',
    flex: 1,
  },
});

