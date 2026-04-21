import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function SuggestCard({ type = 'vendor', searchQuery = '', onSubmit }) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const websiteRef = useRef(null);

  const isVendor = type === 'vendor';

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(`Please enter the ${isVendor ? 'business' : 'organization'} name.`);
      return;
    }
    if (!website.trim()) {
      setError('Please enter the website.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), website: website.trim() });
      setSubmitted(true);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.card}>
        <Image
          source={require('../assets/images/piggy-confetti.png')}
          style={styles.icon}
          resizeMode="contain"
        />
        <Text style={styles.successTitle}>You're awesome! 🎉</Text>
        <Text style={styles.successSubtext}>
          We received your suggestion and will personally review it. Thank you for helping grow the THRIVE community!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Image
        source={
          isVendor
            ? require('../assets/images/piggy-coin.png')
            : require('../assets/images/piggy-money.png')
        }
        style={styles.icon}
        resizeMode="contain"
      />

      <Text style={styles.heading}>
        {isVendor ? 'Know a great business?' : 'Know a great charity?'}
      </Text>

      <Text style={styles.subtext}>
        {searchQuery ? (
          <>
            We couldn't find{' '}
            <Text style={styles.highlight}>"{searchQuery}"</Text>
            {' '}— suggest it and we'll add it!
          </>
        ) : isVendor ? (
          'Help grow the THRIVE network. Suggest a local business and we\'ll reach out to bring them on board.'
        ) : (
          'Help grow our cause partners. Suggest a charity and we\'ll work to add them for the community.'
        )}
      </Text>

      {/* Name Input */}
      <View style={styles.inputWrapper}>
        {isVendor ? (
          <Feather name="briefcase" size={18} color="#DB8633" style={styles.inputIcon} />
        ) : (
          <Image
            source={require('../assets/icons/heart.png')}
            style={[styles.inputIcon, { width: 18, height: 18, tintColor: '#DB8633' }]}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder={isVendor ? 'Business name' : 'Organization name'}
          placeholderTextColor="#bbb"
          value={name}
          onChangeText={t => { setName(t); setError(''); }}
          returnKeyType="next"
          onSubmitEditing={() => websiteRef.current?.focus()}
        />
      </View>

      {/* Website Input */}
      <View style={styles.inputWrapper}>
        <Feather name="globe" size={18} color="#DB8633" style={styles.inputIcon} />
        <TextInput
          ref={websiteRef}
          style={styles.input}
          placeholder="Website (e.g. www.example.com)"
          placeholderTextColor="#bbb"
          value={website}
          onChangeText={t => { setWebsite(t); setError(''); }}
          autoCapitalize="none"
          keyboardType="url"
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>
          {isSubmitting ? 'Sending...' : 'Send Suggestion'}
        </Text>
        {!isSubmitting && (
          <Feather name="send" size={15} color="#fff" style={{ marginLeft: 6 }} />
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>We personally review every suggestion ❤️</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 32,
    marginHorizontal: 20,
    marginVertical: 16,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  icon: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a2e3b',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: '#8a9aaa',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  highlight: {
    color: '#DB8633',
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#eeeeee',
    paddingHorizontal: 16,
    marginBottom: 12,
    width: '100%',
    height: 54,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a2e3b',
  },
  error: {
    color: '#e53e3e',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DB8633',
    borderRadius: 14,
    paddingVertical: 17,
    width: '100%',
    marginTop: 4,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    marginTop: 18,
    fontSize: 13,
    color: '#c0c8d0',
    textAlign: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a2e3b',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 15,
    color: '#8a9aaa',
    textAlign: 'center',
    lineHeight: 23,
  },
});
