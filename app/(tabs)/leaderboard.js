import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { MotiView } from 'moti';

export default function LeaderboardScreen() {
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(true);

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
      </TouchableOpacity>

      {/* Animated Twinkling Stars */}
      <MotiView
        from={{ opacity: 0.3 }}
        animate={{ opacity: 1 }}
        transition={{ loop: true, type: 'timing', duration: 1500 }}
        style={styles.star1}
      >
        <Text style={styles.star}>✨</Text>
      </MotiView>

      <MotiView
        from={{ opacity: 0.3 }}
        animate={{ opacity: 1 }}
        transition={{ loop: true, type: 'timing', duration: 2000 }}
        style={styles.star2}
      >
        <Text style={styles.star}>✨</Text>
      </MotiView>

      {/* Piggy on Podium Illustration */}
      <Image
        source={require('../../assets/images/piggy-on-podium.png')}
        style={styles.piggyImage}
        resizeMode="contain"
      />

      {/* Coming Soon Text */}
      <Text style={styles.title}>Leaderboard Coming Soon!</Text>
      <Text style={styles.subtitle}>Get ready to compete, give, and glow ✨</Text>

      {/* Notify Me Button */}
      <TouchableOpacity style={styles.notifyButton} onPress={() => alert('We’ll notify you when it’s live!')}>
        <Text style={styles.notifyButtonText}>Notify Me When It’s Live!</Text>
      </TouchableOpacity>

      {showConfetti && (
        <ConfettiCannon
          count={60}
          origin={{ x: -10, y: 0 }}
          fadeOut
          explosionSpeed={300}
          fallSpeed={2500}
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
  },
  piggyImage: {
    width: 350,
    height: 350,
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6D6E72',
    marginBottom: 30,
    textAlign: 'center',
  },
  notifyButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  notifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  star: {
    fontSize: 22,
  },
  star1: {
    position: 'absolute',
    top: 130,
    left: 60,
  },
  star2: {
    position: 'absolute',
    top: 100,
    right: 60,
  },
});
