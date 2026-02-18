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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign, Feather, MaterialIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useUser } from '../app/context/UserContext';
import API from '../app/lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function InviteFriendsModal({ visible, onClose }) {
  const { user } = useUser();
  const [referralLink, setReferralLink] = useState('');
  const [friendsCount, setFriendsCount] = useState(0);
  const [paidFriendsCount, setPaidFriendsCount] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
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
        const userId = user?.id || user?.email?.split('@')[0] || 'user';
        const link = `https://thrive-web-jet.vercel.app/signup?ref=${encodeURIComponent(userId)}`;
        setReferralLink(link);
      }
      
      // Use paidFriendsCount from API, fallback to friendsCount
      const actualPaidFriendsCount = data?.paidFriendsCount ?? data?.friendsCount ?? 0;
      setPaidFriendsCount(actualPaidFriendsCount);
      setFriendsCount(data?.friendsCount || 0);
      setTotalEarned(data?.totalEarned || 0);
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
      // Fallback: generate referral link
      const userId = user?.id || user?.email?.split('@')[0] || 'user';
      const link = `https://thrive-web-jet.vercel.app/signup?ref=${encodeURIComponent(userId)}`;
      setReferralLink(link);
      setPaidFriendsCount(0);
      setFriendsCount(0);
      setTotalEarned(0);
      setApiMilestones([]);
      setFriendsList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      // Use Share API which works on all platforms
      // On iOS/Android, users can copy from the share sheet
      const result = await Share.share({
        message: referralLink,
        title: 'Thrive Referral Link',
      });
      
      if (result.action === Share.sharedAction) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('Error sharing link:', error);
      // Fallback: Show the link in an alert so user can manually copy
      Alert.alert('Referral Link', referralLink, [
        { text: 'OK' }
      ]);
    }
  };

  const handleShare = async (method) => {
    const message = `Join me on Thrive! Together we can make a real difference in our community. Get exclusive discounts from local businesses while supporting amazing causes. Sign up here: ${referralLink}`;
    const title = 'Join Thrive with me!';

    try {
      switch (method) {
        case 'native':
          const result = await Share.share({
            message: message,
            title: title,
            url: referralLink,
          });
          if (result.action === Share.sharedAction) {
            console.log('Shared successfully');
          }
          break;

        case 'sms':
          const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
          if (await Linking.canOpenURL(smsUrl)) {
            await Linking.openURL(smsUrl);
          } else {
            Alert.alert('Error', 'SMS is not available on this device');
          }
          break;

        case 'email':
          const emailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;
          if (await Linking.canOpenURL(emailUrl)) {
            await Linking.openURL(emailUrl);
          } else {
            Alert.alert('Error', 'Email is not available on this device');
          }
          break;

        case 'whatsapp':
          const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
          if (await Linking.canOpenURL(whatsappUrl)) {
            await Linking.openURL(whatsappUrl);
          } else {
            Alert.alert('Error', 'WhatsApp is not installed');
          }
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Error', 'Failed to share. Please try again.');
    }
  };

  // Default milestones (used if API doesn't return milestones)
  const defaultMilestones = [
    { 
      count: 1, 
      reward: '$5 Credit',
      description: 'Get $5 credit toward your next donation',
      cost: '$5 per referral'
    },
    { 
      count: 5, 
      reward: '$25 Credit + Badge',
      description: 'Earn $25 credit and unlock the "Community Builder" badge',
      cost: '$25 one-time'
    },
    { 
      count: 10, 
      reward: '$50 Credit + VIP Access',
      description: 'Get $50 credit and early access to new local deals',
      cost: '$50 one-time'
    },
    { 
      count: 25, 
      reward: '$100 Credit + Recognition',
      description: 'Earn $100 credit and featured recognition on our community page',
      cost: '$100 one-time'
    },
  ];

  // Use API milestones if available, otherwise use defaults
  const milestones = apiMilestones.length > 0 
    ? apiMilestones.map(m => ({
        count: m.count,
        reward: m.reward,
        description: defaultMilestones.find(d => d.count === m.count)?.description || m.description || '',
        unlocked: m.unlocked || false,
        earnedAt: m.earnedAt || null,
      }))
    : defaultMilestones.map(m => ({
        ...m,
        unlocked: paidFriendsCount >= m.count,
        earnedAt: null,
      }));

  const nextMilestone = milestones.find(m => m.count > paidFriendsCount) || milestones[milestones.length - 1];
  const progress = paidFriendsCount > 0 ? (paidFriendsCount / nextMilestone.count) * 100 : 0;

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
                  <AntDesign name="close" size={24} color="#324E58" />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>Invite friends and multiply your impact together!</Text>
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
                  <Text style={styles.statsNumber}>${totalEarned}</Text>
                  <Text style={styles.statsLabel}>Credits Earned</Text>
                </View>
              </LinearGradient>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Progress to {nextMilestone.reward}</Text>
                <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {nextMilestone.count - paidFriendsCount} more {nextMilestone.count - paidFriendsCount === 1 ? 'friend' : 'friends'} {nextMilestone.count - paidFriendsCount === 1 ? 'who joins' : 'who join'} to unlock {nextMilestone.reward}!
              </Text>
            </View>

            {/* Badges Section */}
            {(() => {
              // Extract badges from milestones that have "Badge" in reward or description
              const earnedBadges = milestones
                .filter(m => {
                  const hasBadge = (m.reward && m.reward.includes('Badge')) || 
                                  (m.description && m.description.includes('badge'));
                  const isUnlocked = m.unlocked || paidFriendsCount >= m.count;
                  return hasBadge && isUnlocked;
                })
                .map(m => {
                  // Extract badge name from description (e.g., 'unlock the "Community Builder" badge')
                  let badgeName = 'Community Builder'; // Default
                  if (m.description) {
                    const badgeMatch = m.description.match(/"([^"]+)" badge/i);
                    if (badgeMatch) {
                      badgeName = badgeMatch[1];
                    } else if (m.description.includes('Community Builder')) {
                      badgeName = 'Community Builder';
                    }
                  }
                  // Fallback: use milestone count to determine badge
                  if (badgeName === 'Community Builder' && !m.description?.includes('Community Builder')) {
                    if (m.count === 5) badgeName = 'Community Builder';
                    else if (m.count === 10) badgeName = 'VIP Member';
                    else if (m.count === 25) badgeName = 'Community Champion';
                  }
                  return {
                    name: badgeName,
                    earnedAt: m.earnedAt,
                    milestone: m.count,
                  };
                });
              
              console.log('🔍 Badge Debug Info:');
              console.log('  - Paid friends count:', paidFriendsCount);
              console.log('  - Milestones:', milestones.map(m => ({ count: m.count, reward: m.reward, unlocked: m.unlocked, hasBadge: (m.reward && m.reward.includes('Badge')) || (m.description && m.description.includes('badge')) })));
              console.log('  - Earned badges:', earnedBadges.length, earnedBadges);
              
              // For testing: Show badge section even if empty (with message)
              // Remove this after testing
              if (earnedBadges.length === 0 && paidFriendsCount < 5) {
                console.log('⚠️ No badges yet - need 5+ paid friends to unlock Community Builder badge');
              }
              
              // Show grayed out badge if not earned yet (for UI preview)
              let displayBadges = earnedBadges;
              if (earnedBadges.length === 0 && paidFriendsCount < 5) {
                // Show grayed out badge if not earned yet
                displayBadges = [{
                  name: 'Community Builder',
                  earnedAt: null,
                  milestone: 5,
                  isTest: true,
                }];
              }
              
              return displayBadges.length > 0 ? (
                <View style={styles.badgesSection}>
                  <Text style={styles.sectionTitle}>Your Badges</Text>
                  <View style={styles.badgesContainer}>
                    {displayBadges.map((badge, index) => (
                      <View key={index} style={[styles.badgeItem, badge.isTest && !badge.earnedAt && styles.badgeItemTest]}>
                        <View style={styles.badgeIcon}>
                          <AntDesign name="star" size={28} color={badge.isTest && !badge.earnedAt ? "#9CA3AF" : "#DB8633"} />
                        </View>
                        <Text style={[styles.badgeName, badge.isTest && !badge.earnedAt && styles.badgeNameTest]}>{badge.name}</Text>
                        {badge.isTest && !badge.earnedAt ? (
                          <Text style={styles.badgeDate}>Unlock at 5 friends</Text>
                        ) : badge.earnedAt ? (
                          <Text style={styles.badgeDate}>
                            {new Date(badge.earnedAt).toLocaleDateString()}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null;
            })()}

            {/* Milestones */}
            <View style={styles.milestonesSection}>
              <Text style={styles.sectionTitle}>Milestones & Rewards</Text>
              <Text style={styles.milestoneNote}>
                Rewards are earned when friends join and start making a monthly difference in our community
              </Text>
              <View style={styles.milestonesList}>
                {milestones.map((milestone, index) => (
                  <View
                    key={index}
                    style={[
                      styles.milestoneItem,
                      (milestone.unlocked || paidFriendsCount >= milestone.count) && styles.milestoneItemUnlocked,
                    ]}
                  >
                    <View style={styles.milestoneIcon}>
                      {(milestone.unlocked || paidFriendsCount >= milestone.count) ? (
                        <AntDesign name="checkcircle" size={24} color="#10B981" />
                      ) : (
                        <View style={styles.milestoneIconLocked}>
                          <Text style={styles.milestoneIconText}>{milestone.count}</Text>
                        </View>
                      )}
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
                ))}
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

            {/* Referral Link */}
            <View style={styles.referralSection}>
              <Text style={styles.sectionTitle}>Your Referral Link</Text>
              <View style={styles.referralLinkContainer}>
                <TextInput
                  style={styles.referralLink}
                  value={referralLink || 'Loading...'}
                  editable={false}
                  selectTextOnFocus={true}
                  numberOfLines={1}
                />
                <TouchableOpacity
                  onPress={handleCopyLink}
                  style={[styles.copyButton, copied && styles.copyButtonCopied]}
                >
                  {copied ? (
                    <AntDesign name="check" size={20} color="#fff" />
                  ) : (
                    <Feather name="share" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.referralHint}>
                Tap the link to select it, or use the share button to copy
              </Text>
            </View>

            {/* Share Options */}
            <View style={styles.shareSection}>
              <Text style={styles.sectionTitle}>Share with Friends</Text>
              <View style={styles.shareButtons}>
                <TouchableOpacity
                  style={[styles.shareButton, styles.shareButtonPrimary]}
                  onPress={() => handleShare('native')}
                >
                  <MaterialIcons name="share" size={24} color="#fff" />
                  <Text style={styles.shareButtonText}>Share</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={() => handleShare('sms')}
                >
                  <MaterialIcons name="message" size={24} color="#DB8633" />
                  <Text style={[styles.shareButtonText, styles.shareButtonTextSecondary]}>SMS</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareButton}
                  onPress={() => handleShare('email')}
                >
                  <MaterialIcons name="email" size={24} color="#DB8633" />
                  <Text style={[styles.shareButtonText, styles.shareButtonTextSecondary]}>Email</Text>
                </TouchableOpacity>

                {Platform.OS !== 'ios' && (
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={() => handleShare('whatsapp')}
                  >
                    <MaterialIcons name="chat" size={24} color="#DB8633" />
                    <Text style={[styles.shareButtonText, styles.shareButtonTextSecondary]}>WhatsApp</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Benefits */}
            <View style={styles.benefitsSection}>
              <Text style={styles.sectionTitle}>Why Invite Friends?</Text>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <AntDesign name="gift" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Earn rewards for each friend who joins</Text>
                </View>
                <View style={styles.benefitItem}>
                  <AntDesign name="heart" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Multiply your impact together</Text>
                </View>
                <View style={styles.benefitItem}>
                  <AntDesign name="star" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Unlock exclusive discounts and perks</Text>
                </View>
                <View style={styles.benefitItem}>
                  <AntDesign name="team" size={20} color="#DB8633" />
                  <Text style={styles.benefitText}>Build a community of changemakers</Text>
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
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#324E58',
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#7A8D9C',
    lineHeight: 22,
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
  milestoneIconLocked: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  milestoneIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7A8D9C',
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
  milestoneNote: {
    fontSize: 12,
    color: '#7A8D9C',
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
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
    marginRight: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  referralHint: {
    fontSize: 12,
    color: '#7A8D9C',
    marginTop: 8,
    textAlign: 'center',
  },
  copyButton: {
    backgroundColor: '#DB8633',
    padding: 10,
    borderRadius: 8,
  },
  copyButtonCopied: {
    backgroundColor: '#10B981',
  },
  shareSection: {
    marginBottom: 24,
  },
  shareButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  shareButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  shareButtonPrimary: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
    width: '100%',
    minWidth: '100%',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  shareButtonTextSecondary: {
    color: '#DB8633',
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

