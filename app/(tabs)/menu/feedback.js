// File: app/(tabs)/menu/feedback.js

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { AntDesign, Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function FeedbackScreen() {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('general');

  const feedbackTypes = [
    { id: 'general', label: 'General', icon: 'message-circle' },
    { id: 'bug', label: 'Bug Report', icon: 'alert-triangle' },
    { id: 'feature', label: 'Feature Request', icon: 'zap' },
    { id: 'improvement', label: 'Improvement', icon: 'trending-up' },
  ];

  const handleRating = (value) => {
    setRating(value);
  };

  const handleSubmit = () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting feedback.');
      return;
    }
    
    if (!feedback.trim()) {
      Alert.alert('Feedback Required', 'Please write your feedback before submitting.');
      return;
    }

    // You can later send this data to your backend
    console.log('Rating:', rating);
    console.log('Feedback Type:', feedbackType);
    console.log('Feedback:', feedback);
    
    Alert.alert(
      '🎉 Thank You!',
      'Your feedback has been submitted successfully. We appreciate your input!',
      [
        { 
          text: 'OK', 
          onPress: () => {
            setRating(0);
            setFeedback('');
            setFeedbackType('general');
          }
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Standardized Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/menu')}>
            <Image 
              source={require('../../../assets/icons/arrow-left.png')} 
              style={{ width: 24, height: 24, tintColor: '#324E58' }} 
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Feedback</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Hero Section with Gradient */}
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <View style={styles.heroContent}>
            <View style={styles.iconContainer}>
              <Feather name="message-circle" size={32} color="#ffffff" />
            </View>
            <Text style={styles.heroTitle}>We Value Your Opinion!</Text>
            <Text style={styles.heroSubtitle}>
              Help us improve Thrive by sharing your thoughts, suggestions, or reporting any issues you encounter.
            </Text>
          </View>
        </LinearGradient>

        {/* Feedback Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What type of feedback?</Text>
          <View style={styles.feedbackTypeGrid}>
            {feedbackTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.feedbackTypeButton,
                  feedbackType === type.id && styles.selectedFeedbackType
                ]}
                onPress={() => setFeedbackType(type.id)}
              >
                <Feather 
                  name={type.icon} 
                  size={20} 
                  color={feedbackType === type.id ? '#ffffff' : '#324E58'} 
                />
                <Text style={[
                  styles.feedbackTypeText,
                  feedbackType === type.id && styles.selectedFeedbackTypeText
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Rating Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How would you rate your experience?</Text>
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((num) => (
              <TouchableOpacity 
                key={num} 
                onPress={() => handleRating(num)}
                style={styles.starButton}
              >
                {num <= rating ? (
                  <AntDesign
                    name="star"
                    size={36}
                    color="#FFD700"
                  />
                ) : (
                  <MaterialIcons
                    name="star-border"
                    size={36}
                    color="#D1D5DB"
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingLabel}>
            {rating === 0 && 'Tap to rate'}
            {rating === 1 && 'Poor'}
            {rating === 2 && 'Fair'}
            {rating === 3 && 'Good'}
            {rating === 4 && 'Very Good'}
            {rating === 5 && 'Excellent'}
          </Text>
        </View>

        {/* Feedback Input Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tell us more</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Share your thoughts, suggestions, or describe any issues you've encountered..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={6}
            value={feedback}
            onChangeText={setFeedback}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>{feedback.length}/500</Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity 
          style={[
            styles.submitButton,
            (!rating || !feedback.trim()) && styles.submitButtonDisabled
          ]} 
          onPress={handleSubmit}
          disabled={!rating || !feedback.trim()}
        >
          <LinearGradient
            colors={rating && feedback.trim() ? ["#DB8633", "#E5A04A"] : ["#E2E8F0", "#CBD5E1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButtonGradient}
          >
            <Feather name="send" size={20} color={rating && feedback.trim() ? "#ffffff" : "#9CA3AF"} />
            <Text style={[
              styles.submitButtonText,
              (!rating || !feedback.trim()) && styles.submitButtonTextDisabled
            ]}>
              Send Feedback
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  heroSection: {
    borderRadius: 20,
    marginBottom: 24,
    padding: 24,
    alignItems: 'center',
  },
  heroContent: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#324E58',
    marginBottom: 16,
  },
  feedbackTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  feedbackTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 120,
    justifyContent: 'center',
  },
  selectedFeedbackType: {
    backgroundColor: '#DB8633',
    borderColor: '#DB8633',
  },
  feedbackTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#324E58',
  },
  selectedFeedbackTypeText: {
    color: '#ffffff',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: {
    padding: 8,
  },
  ratingLabel: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  feedbackInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#324E58',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  characterCount: {
    textAlign: 'right',
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#9CA3AF',
  },
});
