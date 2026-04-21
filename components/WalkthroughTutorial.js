import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { TUTORIAL_STEPS } from '../hooks/useTutorial';

const { width: W } = Dimensions.get('window');

export default function WalkthroughTutorial({ visible, currentStepIndex, totalSteps, onNext, onSkip }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Fade + slide in on mount
  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // Animate card change between steps
  const stepAnim = useRef(new Animated.Value(0)).current;
  const prevIndexRef = useRef(currentStepIndex);
  useEffect(() => {
    if (prevIndexRef.current !== currentStepIndex) {
      prevIndexRef.current = currentStepIndex;
      stepAnim.setValue(20);
      Animated.spring(stepAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }).start();
    }
  }, [currentStepIndex]);

  if (!visible) return null;
  const step = TUTORIAL_STEPS[currentStepIndex];
  const isLast = currentStepIndex === totalSteps - 1;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onSkip}>
      {/* Dimmed background */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onSkip} />
      </Animated.View>

      {/* Card */}
      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [
              { translateY: slideAnim },
              { translateY: stepAnim },
            ],
          },
        ]}
      >
        {/* Step dots */}
        <View style={styles.dotsRow}>
          {TUTORIAL_STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentStepIndex && styles.dotActive]} />
          ))}
        </View>

        {/* Icon */}
        <Text style={styles.icon}>{step.icon}</Text>

        {/* Content */}
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} style={styles.nextBtn}>
            <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  dotActive: {
    backgroundColor: '#DB8633',
    width: 20,
  },
  icon: {
    fontSize: 52,
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a2e3b',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#6b7f8e',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 15,
    color: '#aaa',
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#DB8633',
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
