import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons'; 
import API from './lib/api';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const socialLogins = [
    { name: 'Facebook', icon: require('../assets/images/Facebook-icon.png') },
    { name: 'Google', icon: require('../assets/images/Google-icon.png') },
    { name: 'Apple', icon: require('../assets/images/Apple-icon.png') },
  ];

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please fill out all fields.');
      return;
    }

    try {
      await API.post('/api/auth/signup', { email, password });
      router.push({ pathname: '/signupProfile', params: { email } });
    } catch (error) {
      Alert.alert('Signup Failed', 'Something went wrong. Try again.');
      console.error('❌ Signup error:', error.response?.data || error.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Blue gradient as absolute background for top half */}
      <View style={styles.gradientAbsoluteBg} pointerEvents="none">
        <LinearGradient
          colors={["#2C3E50", "#4CA1AF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start' }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backArrow} onPress={() => router.replace('/')}> 
            <AntDesign name="arrowleft" size={24} color="#324E58" />
          </TouchableOpacity>
          <View style={styles.piggyLogoColumn}>
            <Image source={require('../assets/images/piggy-with-flowers.png')} style={styles.logo} />
            <Image source={require('../assets/logos/thrive-logo-white.png')} style={styles.brand} />
          </View>
          <View style={styles.infoCard}>
            <TextInput
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholderTextColor="#6d6e72"
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              placeholderTextColor="#6d6e72"
            />
            <TouchableOpacity style={styles.signupButton} onPress={handleSignup}>
              <Text style={styles.signupButtonText}>Create Account</Text>
            </TouchableOpacity>
            <Text style={styles.orText}>Or sign up with</Text>
            <View style={styles.socialIconsContainer}>
              {socialLogins.map((social, index) => (
                <TouchableOpacity key={index} style={styles.socialIconButton}>
                  <Image source={social.icon} style={styles.socialIcon} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientAbsoluteBg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.45, zIndex: 0, overflow: 'hidden' },
  gradientBg: { width: SCREEN_WIDTH, height: '100%', borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  piggyLogoColumn: { alignItems: 'center', justifyContent: 'center', marginTop: 80, marginBottom: 10, zIndex: 1 },
  logo: {
    width: 140,
    height: 160,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  brand: {
    width: 163,
    height: 29,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    width: '90%',
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 10,
    alignItems: 'center',
    zIndex: 2,
  },
  backArrow: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 6,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tagline: {
    fontSize: 16,
    color: '#6d6e72',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    height: 48,
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    width: '100%',
    paddingHorizontal: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e1e1e5',
  },
  signupButton: {
    backgroundColor: '#db8633',
    borderRadius: 8,
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  orText: {
    color: '#6d6e72',
    marginBottom: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  socialIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  socialIconButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    borderRadius: 8,
    marginHorizontal: 8,
  },
  socialIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
});
