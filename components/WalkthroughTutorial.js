import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import Svg, { Rect, Defs, Mask } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TUTORIAL_STORAGE_KEY = '@thrive_walkthrough_completed';

export default function WalkthroughTutorial({ 
  visible, 
  onComplete, 
  currentStep,
  highlightPosition,
  title,
  description,
  onNext,
  onSkip,
  totalSteps = 3
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [tooltipHeight, setTooltipHeight] = useState(0);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;
  
  // If no highlight position yet, show tutorial without highlight (will measure later)
  if (!highlightPosition) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onSkip}
      >
        <View style={styles.container}>
          <View style={styles.overlay} />
          <Animated.View
            style={[
              styles.tooltip,
              {
                top: SCREEN_HEIGHT * 0.3,
                left: 20,
                right: 20,
                opacity: fadeAnim,
              },
            ]}
          >
            <LinearGradient
              colors={['#2C3E50', '#4CA1AF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tooltipGradient}
            >
              <View style={styles.tooltipContent}>
                <Text style={styles.stepIndicator}>
                  Step {currentStep} of {totalSteps}
                </Text>
                <Text style={styles.tooltipTitle}>{title}</Text>
                <Text style={styles.tooltipDescription}>{description}</Text>
                
                <View style={styles.tooltipActions}>
                  <TouchableOpacity
                    style={styles.skipButton}
                    onPress={onSkip}
                  >
                    <Text style={styles.skipButtonText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.nextButton}
                    onPress={onNext}
                  >
                    <Text style={styles.nextButtonText}>
                      {currentStep === totalSteps ? 'Got it!' : 'Next'}
                    </Text>
                    {currentStep < totalSteps && (
                      <AntDesign name="right" size={16} color="#fff" style={{ marginLeft: 4 }} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  const { x, y, width, height } = highlightPosition;
  const highlightPaddingX = 12;
  const highlightPaddingY = 8;
  const paddedX = Math.max(0, x - highlightPaddingX);
  const paddedY = Math.max(0, y - highlightPaddingY);
  const paddedWidth = Math.min(SCREEN_WIDTH - paddedX, width + highlightPaddingX * 2);
  const paddedHeight = Math.min(SCREEN_HEIGHT - paddedY, height + highlightPaddingY * 2);
  const tooltipMargin = 20;
  const belowTop = paddedY + paddedHeight + tooltipMargin;
  const aboveTop = Math.max(tooltipMargin, paddedY - tooltipMargin - tooltipHeight);
  const canShowBelow = belowTop + tooltipHeight + tooltipMargin <= SCREEN_HEIGHT;
  const tooltipTop = canShowBelow ? belowTop : aboveTop;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onSkip}
    >
      <View style={styles.container}>
        {/* Dark overlay with rounded cutout */}
        <Animated.View style={[styles.overlayMask, { opacity: overlayOpacity }]}>
          <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
            <Defs>
              <Mask id="cutout-mask">
                <Rect width="100%" height="100%" fill="white" />
                <Rect x={paddedX} y={paddedY} width={paddedWidth} height={paddedHeight} rx={12} ry={12} fill="black" />
              </Mask>
            </Defs>
            <Rect
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.7)"
              mask="url(#cutout-mask)"
            />
          </Svg>
        </Animated.View>

        {/* Highlight border */}
        <Animated.View
          style={[
            styles.highlightBox,
            {
              left: paddedX,
              top: paddedY,
              width: paddedWidth,
              height: paddedHeight,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.highlightBorder} />
        </Animated.View>

        {/* Tooltip */}
        <Animated.View
          style={[
            styles.tooltip,
            {
              top: tooltipTop,
              left: 20,
              right: 20,
              opacity: fadeAnim,
            },
          ]}
          onLayout={(event) => {
            const { height: measuredHeight } = event.nativeEvent.layout;
            if (measuredHeight && measuredHeight !== tooltipHeight) {
              setTooltipHeight(measuredHeight);
            }
          }}
        >
          <LinearGradient
            colors={['#2C3E50', '#4CA1AF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tooltipGradient}
          >
            <View style={styles.tooltipContent}>
              <Text style={styles.stepIndicator}>
                Step {currentStep} of {totalSteps}
              </Text>
              <Text style={styles.tooltipTitle}>{title}</Text>
              <Text style={styles.tooltipDescription}>{description}</Text>
              
              <View style={styles.tooltipActions}>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={onSkip}
                >
                  <Text style={styles.skipButtonText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={onNext}
                >
                  <Text style={styles.nextButtonText}>
                    {currentStep === totalSteps ? 'Got it!' : 'Next'}
                  </Text>
                  {currentStep < totalSteps && (
                    <AntDesign name="right" size={16} color="#fff" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlayMask: {
    ...StyleSheet.absoluteFillObject,
  },
  highlightBox: {
    position: 'absolute',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  highlightBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#DB8633',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  tooltip: {
    position: 'absolute',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipGradient: {
    padding: 20,
    minHeight: 180, // Ensure consistent height across all steps
  },
  tooltipContent: {
    alignItems: 'flex-start',
    minHeight: 140, // Ensure consistent content height
  },
  stepIndicator: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.9,
    marginBottom: 8,
  },
  tooltipTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  tooltipDescription: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.95,
    marginBottom: 20,
  },
  tooltipActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.8,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
