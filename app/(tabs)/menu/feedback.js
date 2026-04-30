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
import * as ImagePicker from 'expo-image-picker';
import API from '../../lib/api';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
const MAX_ATTACHMENTS = 3;

const feedbackTypes = [
  { id: 'general',     label: 'General',         icon: 'message-circle',  showRating: true  },
  { id: 'bug',         label: 'Bug Report',       icon: 'alert-triangle',  showRating: false },
  { id: 'feature',     label: 'Feature Request',  icon: 'zap',             showRating: false },
  { id: 'improvement', label: 'Improvement',      icon: 'trending-up',     showRating: false },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('general');
  const [attachments, setAttachments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentType = feedbackTypes.find((t) => t.id === feedbackType);
  const showRating = currentType?.showRating ?? true;

  const handleTypeChange = (id) => {
    setFeedbackType(id);
    if (!feedbackTypes.find((t) => t.id === id)?.showRating) {
      setRating(0);
    }
  };

  const handlePickAttachment = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to attach files.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setAttachments((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const isValid = feedback.trim().length > 0 && (showRating ? rating > 0 : true);

  const handleSubmit = async () => {
    if (!isValid) {
      if (showRating && rating === 0) {
        Alert.alert('Rating Required', 'Please select a rating before submitting.');
        return;
      }
      Alert.alert('Feedback Required', 'Please write your feedback before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      await API.submitFeedback({
        rating: showRating ? rating : undefined,
        feedbackType,
        message: feedback.trim(),
        attachments,
      });
      Alert.alert(
        'Thank You!',
        'Your feedback has been submitted. We appreciate your input!',
        [{
          text: 'OK',
          onPress: () => {
            setRating(0);
            setFeedback('');
            setFeedbackType('general');
            setAttachments([]);
          },
        }],
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
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

        {/* Hero */}
        <LinearGradient
          colors={['#21555b', '#2d7a82']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <Text style={styles.heroTitle}>We Value Your Opinion!</Text>
          <Text style={styles.heroSubtitle}>
            Help us improve Thrive by sharing your thoughts, suggestions, or reporting any issues you encounter.
          </Text>
        </LinearGradient>

        {/* Feedback type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What type of feedback?</Text>
          <View style={styles.feedbackTypeGrid}>
            {feedbackTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.feedbackTypeButton,
                  feedbackType === type.id && styles.selectedFeedbackType,
                ]}
                onPress={() => handleTypeChange(type.id)}
              >
                <Feather
                  name={type.icon}
                  size={18}
                  color={feedbackType === type.id ? '#ffffff' : '#324E58'}
                />
                <Text style={[
                  styles.feedbackTypeText,
                  feedbackType === type.id && styles.selectedFeedbackTypeText,
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Star rating — general only */}
        {showRating && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How would you rate your experience?</Text>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((num) => (
                <TouchableOpacity key={num} onPress={() => setRating(num)} style={styles.starButton}>
                  {num <= rating ? (
                    <AntDesign name="star" size={36} color="#FFD700" />
                  ) : (
                    <MaterialIcons name="star-border" size={36} color="#D1D5DB" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingLabel}>
              {rating === 0 ? 'Tap to rate' : RATING_LABELS[rating]}
            </Text>
          </View>
        )}

        {/* Feedback text */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tell us more</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder={
              feedbackType === 'bug'
                ? 'Describe the issue and what happened...'
                : feedbackType === 'feature'
                ? 'Describe the feature you would like to see...'
                : feedbackType === 'improvement'
                ? 'What would you like us to improve?'
                : 'Share your thoughts or suggestions...'
            }
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={6}
            value={feedback}
            onChangeText={setFeedback}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.characterCount}>{feedback.length}/500</Text>
        </View>

        {/* Attachments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Attachments{attachments.length > 0 ? ` (${attachments.length}/${MAX_ATTACHMENTS})` : ''}
          </Text>

          {attachments.length > 0 && (
            <View style={styles.attachmentRow}>
              {attachments.map((uri, index) => (
                <View key={index} style={styles.attachmentThumb}>
                  <Image source={{ uri }} style={styles.thumbImage} />
                  <TouchableOpacity
                    style={styles.removeThumb}
                    onPress={() => handleRemoveAttachment(index)}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {attachments.length < MAX_ATTACHMENTS && (
            <TouchableOpacity style={styles.attachButton} onPress={handlePickAttachment}>
              <Feather name="paperclip" size={18} color="#21555b" />
              <Text style={styles.attachButtonText}>
                {attachments.length === 0 ? 'Attach a file' : 'Add another file'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, (!isValid || isSubmitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || isSubmitting}
        >
          <LinearGradient
            colors={isValid && !isSubmitting ? ['#DB8633', '#E5A04A'] : ['#E2E8F0', '#CBD5E1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitButtonGradient}
          >
            <Feather name="send" size={20} color={isValid && !isSubmitting ? '#fff' : '#9CA3AF'} />
            <Text style={[styles.submitButtonText, (!isValid || isSubmitting) && styles.submitButtonTextDisabled]}>
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#6d6e72', textAlign: 'center', flex: 1 },
  headerSpacer: { width: 32 },

  heroSection: {
    borderRadius: 20,
    marginBottom: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#324E58', marginBottom: 16 },

  feedbackTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  feedbackTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 120,
    justifyContent: 'center',
  },
  selectedFeedbackType: { backgroundColor: '#DB8633', borderColor: '#DB8633' },
  feedbackTypeText: { fontSize: 13, fontWeight: '500', color: '#324E58' },
  selectedFeedbackTypeText: { color: '#fff' },

  ratingContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  starButton: { padding: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 14, color: '#6B7280', fontStyle: 'italic' },

  feedbackInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: '#324E58',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  characterCount: { textAlign: 'right', fontSize: 12, color: '#9CA3AF', marginTop: 6 },

  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  attachmentThumb: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  thumbImage: { width: '100%', height: '100%' },
  removeThumb: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 3,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#21555b',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
  attachButtonText: { fontSize: 14, fontWeight: '600', color: '#21555b' },

  submitButton: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitButtonTextDisabled: { color: '#9CA3AF' },
});
