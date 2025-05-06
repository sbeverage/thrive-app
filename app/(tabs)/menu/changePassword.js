import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function ChangePassword() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleUpdate = () => {
    if (!newPassword || !confirmPassword) {
      alert('Please fill in both fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    alert('✅ Password Updated!');
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.header}>Change Password</Text>
      </TouchableOpacity>

      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder="New Password"
          placeholderTextColor="#888"
          secureTextEntry={!showNew}
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowNew(!showNew)}>
          <Feather name="eye" size={18} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#888"
          secureTextEntry={!showConfirm}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowConfirm(!showConfirm)}>
          <Feather name="eye" size={18} color="#888" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleUpdate}>
        <Text style={styles.buttonText}>Update Password</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#21555B',
    marginLeft: 16,
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#F4F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 14,
    color: '#324E58',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 14,
  },
  button: {
    marginTop: 20,
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
