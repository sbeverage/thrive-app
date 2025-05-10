// components/ProfileCompleteModal.js

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

export default function ProfileCompleteModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Image source={require('../assets/images/piggy-confetti.png')} style={styles.piggy} />

          <Text style={styles.title}>Congrats!</Text>

          <Text style={styles.message}>
            <Text style={{ color: '#DB8633', fontWeight: '600' }}>You have earned +25 points </Text>
            for completing your profile. Start seeing the impact you can make!
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.ghostButton}>
              <Text style={styles.ghostText}>Post On Newsfeed</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.filledButton} onPress={onClose}>
              <Text style={styles.filledText}>Wow, Thanks</Text>
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
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    width: '85%',
  },
  piggy: {
    width: 170,
    height: 170,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#324E58',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ghostButton: {
    backgroundColor: '#F0F0F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  ghostText: {
    color: '#324E58',
    fontSize: 14,
  },
  filledButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  filledText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
