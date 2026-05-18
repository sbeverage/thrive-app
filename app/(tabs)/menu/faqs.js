import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const FAQ_ITEMS = [
  {
    question: 'What is Thrive Initiative?',
    answer:
      'Thrive connects you with local business discounts while supporting a nonprofit you care about. You save money when you shop, and your monthly donation goes directly to your chosen cause.',
  },
  {
    question: 'How do discounts work?',
    answer:
      'Browse businesses on the Discounts tab, open a vendor to see available offers, and tap Redeem to get your code. Show the code at checkout. You can track what you saved under Savings Tracker in the menu.',
  },
  {
    question: 'How does my monthly donation work?',
    answer:
      'During signup you choose a cause and a monthly amount. Thrive charges your card each month and sends your gift to that beneficiary. View or update your plan anytime under Donation Summary or Manage Billing in the menu.',
  },
  {
    question: 'Can I change my cause or donation amount?',
    answer:
      'Yes. Use Donation Summary to adjust your monthly amount or payment method. To support a different charity, change your beneficiary from the Beneficiary tab or your profile settings when that option is available.',
  },
  {
    question: 'What is Grow Your Impact?',
    answer:
      'Invite friends with your personal referral link. When they sign up and become active donors, you unlock recognition badges—and at higher tiers, a chance to be featured on our website.',
  },
  {
    question: 'Why was I asked to enter my bill and savings after redeeming a discount?',
    answer:
      'After you use a discount, you can optionally record your total bill and savings so you can see your impact over time. You can skip this step if you prefer.',
  },
  {
    question: 'How do I update my password or profile?',
    answer:
      'Open the menu, go to My Profile, then choose Edit Profile or Change Password. For billing questions, use Manage Billing under Donations & Savings.',
  },
  {
    question: 'Still have questions?',
    answer:
      'Tap Send Feedback in the menu to reach our team. We read every message and will get back to you as soon as we can.',
  },
];

export default function FaqsScreen() {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace('/(tabs)/menu')}
          >
            <Image
              source={require('../../../assets/icons/arrow-left.png')}
              style={{ width: 24, height: 24, tintColor: '#324E58' }}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>FAQs</Text>
          <View style={styles.headerSpacer} />
        </View>

        <LinearGradient
          colors={['#21555b', '#2d7a82']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSubtitle}>
            Quick answers about discounts, donations, and your account.
          </Text>
        </LinearGradient>

        <View style={styles.faqList}>
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <TouchableOpacity
                key={item.question}
                style={[styles.faqItem, isOpen && styles.faqItemOpen]}
                onPress={() => toggle(index)}
                activeOpacity={0.85}
              >
                <View style={styles.faqQuestionRow}>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <Feather
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#7A8D9C"
                  />
                </View>
                {isOpen ? (
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.feedbackLink}
          onPress={() => router.push('/menu/feedback')}
        >
          <Feather name="message-circle" size={18} color="#DB8633" />
          <Text style={styles.feedbackLinkText}>Send Feedback</Text>
          <Feather name="chevron-right" size={18} color="#DB8633" />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 100 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
  },
  backButton: {},
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: { width: 32 },
  heroSection: {
    borderRadius: 20,
    marginBottom: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  faqList: { gap: 10 },
  faqItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  faqItemOpen: {
    backgroundColor: '#fff',
    borderColor: '#DB8633',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
    lineHeight: 21,
  },
  faqAnswer: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
  },
  feedbackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
  },
  feedbackLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DB8633',
  },
});
