import React, { useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import ProfileCompleteModal from '../../components/ProfileCompleteModal';

export default function StripeIntegration() {
  const router = useRouter();

  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const handleContinue = () => {
    setShowModal(true);
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressActive} />
          <View style={styles.progressActive} />
          <View style={styles.progressActive} />
          <View style={styles.progressActive} />
          <View style={styles.progressActive} />
          <Image source={require('../../assets/images/walking-piggy.png')} style={{ width: 30, height: 24, marginLeft: 5 }} />
        </View>

        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: '#DB8633', fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        {/* Piggy and Speech Bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 }}>
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>
              You’re almost done!{"\n"}
              Finish up by adding your credit card to process the payments each month.
            </Text>
          </View>
          <Image source={require('../../assets/images/piggy-coin.png')} style={styles.piggy} />
        </View>

        {/* Stripe Logo */}
        <Image
          source={require('../../assets/images/stripe-logo.png')}
          style={styles.stripeLogo}
          resizeMode="contain"
        />

        {/* Card Inputs */}
        <View style={{ width: '100%', marginTop: 20 }}>
          <TextInput
            style={styles.input}
            placeholder="Card number"
            placeholderTextColor="#6d6e72"
            keyboardType="numeric"
            value={cardNumber}
            onChangeText={setCardNumber}
          />
          <TextInput
            style={styles.input}
            placeholder="Holder name"
            placeholderTextColor="#6d6e72"
            value={holderName}
            onChangeText={setHolderName}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TextInput
              style={[styles.input, { width: '48%' }]}
              placeholder="Expiry date"
              placeholderTextColor="#6d6e72"
              value={expiryDate}
              onChangeText={setExpiryDate}
            />
            <TextInput
              style={[styles.input, { width: '48%' }]}
              placeholder="CVV"
              placeholderTextColor="#6d6e72"
              secureTextEntry
              value={cvv}
              onChangeText={setCvv}
            />
          </View>
        </View>

        {/* Save Card Option */}
        <TouchableOpacity
          onPress={() => setSaveCard(!saveCard)}
          style={styles.saveCardContainer}
        >
          <AntDesign
            name={saveCard ? "checkcircle" : "checkcircleo"}
            size={20}
            color="#DB8633"
            style={{ marginRight: 8 }}
          />
          <Text style={{ color: '#324E58', fontSize: 16 }}>
            Save card for <Text style={{ fontWeight: '700' }}>monthly billing</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleContinue} style={styles.continueButton}>
          <Text style={{ color: '#fff', fontSize: 16 }}>Save and continue</Text>
        </TouchableOpacity>
      </View>

      <ProfileCompleteModal
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          router.push('/home');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 10,
  },
  progressActive: {
    flex: 1,
    height: 4,
    backgroundColor: '#324E58',
    borderRadius: 10,
    marginHorizontal: 2,
  },
  speechBubble: {
    backgroundColor: '#F5F5FA',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E1E1E5',
    marginRight: 10,
    flex: 1,
  },
  speechText: {
    color: '#324E58',
    fontSize: 16,
  },
  piggy: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },
  stripeLogo: {
    width: 150,
    height: 60,
    marginVertical: 10,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#f5f5fa',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#324E58',
    marginBottom: 10,
  },
  saveCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  footer: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderColor: '#e1e1e5',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  continueButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 20,
  },
});
