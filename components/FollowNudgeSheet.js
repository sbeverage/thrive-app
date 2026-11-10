// "Follow the ones you'd go back to" — shown once, to a donor browsing the
// discounts tab who has not followed a single business.
//
// Following is the quiet backbone of three separate things: the push when a
// business posts a new discount, the warning three days before one expires,
// and later the nearby reminder's ability to name the business rather than
// the street. None of them reach a donor with an empty favourites list.
//
// Signup already teaches this once, on signupFlow/discountTeaser. This is the
// second chance, for the donors who skipped that screen or who signed up
// before it existed. Anyone who already follows somebody never sees it.
//
// It deliberately does NOT ask for location. That permission is a single
// irreversible question on iOS, and spending it here, on someone who has
// never redeemed anything, is spending it at the worst possible moment. The
// footnote below mentions the reminders so the real ask, after their first
// redemption, lands on someone who has already heard of it.

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function FollowNudgeSheet({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.handle} />

          <View style={styles.iconRing}>
            <Ionicons name="heart" size={26} color="#FF6B7A" />
          </View>

          <Text style={styles.title}>Follow the ones you'd go back to</Text>
          <Text style={styles.body}>
            Tap the heart on any business here. We'll tell you when they add a
            new discount, and before one is about to run out.
          </Text>

          <View style={styles.footnote}>
            <Ionicons
              name="location-outline"
              size={16}
              color="#DB8633"
              style={styles.footnoteIcon}
            />
            <Text style={styles.footnoteText}>
              Later we can also nudge you when you're near one, right before
              you pay. We'll ask you about that another time.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E1E1E5',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6d6e72',
    marginBottom: 16,
  },
  footnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF5EB',
    borderRadius: 12,
    padding: 14,
  },
  footnoteIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  footnoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#324E58',
  },
  // Brand orange ground, so the label on it is white.
  button: {
    marginTop: 20,
    backgroundColor: '#DB8633',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
