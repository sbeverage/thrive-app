// components/ProfileCompleteModal.js

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

export default function ProfileCompleteModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Image source={require('../assets/images/piggy-confetti.png')} style={styles.piggy} />

          <Text style={styles.title}>Profile Complete!</Text>

          <View style={styles.pointsContainer}>
            <Text style={styles.pointsLabel}>You've earned</Text>
            <Text style={styles.pointsValue}>+25 POINTS!</Text>
            <Text style={styles.pointsSubtext}>Level 1 Achieved!</Text>
          </View>

                      <Text style={styles.message}>
              <Text style={{ color: '#DB8633', fontWeight: '600' }}>Welcome to the THRIVE community!</Text>
              {'\n'}Your journey to making a difference starts now.
            </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.filledButton} onPress={onClose}>
              <Text style={styles.filledText}>Let's Get Started! 🚀</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>🏆 First Achievement Unlocked!</Text>
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
  pointsContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#DB8633',
    borderStyle: 'dashed',
  },
  pointsLabel: {
    fontSize: 16,
    color: '#6d6e72',
    marginBottom: 8,
  },
  pointsValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#DB8633',
    marginBottom: 8,
    textShadowColor: 'rgba(219, 134, 51, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  pointsSubtext: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C3E50',
  },
  message: {
    fontSize: 17,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 24,
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
  badgeContainer: {
    backgroundColor: '#E8F5E8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  badgeText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
