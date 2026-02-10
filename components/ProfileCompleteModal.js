// components/ProfileCompleteModal.js

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

export default function ProfileCompleteModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Image source={require('../assets/images/piggy-confetti.png')} style={styles.piggy} />

          <Text style={styles.title}>Welcome to Thrive!</Text>

          <Text style={styles.message}>
            <Text style={{ color: '#DB8633', fontWeight: '600' }}>You're all set!</Text>
            {'\n\n'}Thank you for joining our community of changemakers. Your generosity will make a real difference in the lives of those who need it most.
            {'\n\n'}Don't forget to take advantage of the local deals and support the local businesses that are supporting this movement!
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.filledButton} onPress={onClose}>
              <Text style={styles.filledText}>Start Making a Difference</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    padding: 28,
    borderRadius: 24,
    alignItems: 'center',
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  piggy: {
    width: 180,
    height: 180,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#324E58',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 17,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 20,
  },
  filledButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  filledText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
    textAlign: 'center',
  },
});
