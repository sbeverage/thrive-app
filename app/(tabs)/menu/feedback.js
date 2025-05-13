// File: app/(tabs)/menu/feedback.js

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function FeedbackScreen() {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  const handleRating = (value) => {
    setRating(value);
  };

  const handleSubmit = () => {
    // You can later send this data to your backend
    console.log('Rating:', rating);
    console.log('Feedback:', feedback);
    alert('🎉 Feedback submitted!');
    setRating(0);
    setFeedback('');
  };

  return (
    <View style={styles.container}>
      {/* Back Arrow */}
      <TouchableOpacity onPress={() => router.push('/(tabs)/menu')} style={styles.backButton}>
        <AntDesign name="arrowleft" size={24} color="#21555B" />
      </TouchableOpacity>

      <Text style={styles.title}>Send Feedback</Text>

      {/* Piggy + Message Box */}
      <View style={styles.piggyContainer}>
        <Image source={require('../../../assets/images/bolt-piggy.png')} style={styles.piggy} />
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>
            We value your opinion! Share your feedback with us and get a chance to win extra 25 seeds
          </Text>
        </View>
      </View>

      {/* Star Rating */}
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((num) => (
          <TouchableOpacity key={num} onPress={() => handleRating(num)}>
            <AntDesign
              name="star"
              size={32}
              color={num <= rating ? '#DB8633' : '#ccc'}
              style={styles.star}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Feedback Input */}
      <TextInput
        style={styles.textInput}
        placeholder="Write Feedback"
        placeholderTextColor="#aaa"
        multiline
        numberOfLines={4}
        value={feedback}
        onChangeText={setFeedback}
      />

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitText}>Send Feedback</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#fff',
    flex: 1,
  },
  backButton: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 20,
  },
  piggyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  piggy: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    marginRight: 10,
  },
  messageBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 12,
  },
  messageText: {
    color: '#324E58',
    fontSize: 14,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 16,
  },
  star: {
    marginHorizontal: 5,
  },
  textInput: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#324E58',
    height: 120,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelText: {
    color: '#DB8633',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
  },
});
