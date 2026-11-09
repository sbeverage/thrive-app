import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import API from '../../lib/api';
import { useUser } from '../../context/UserContext';
import {
  getBiometricCapability,
  getSavedBiometricEmail,
  saveBiometricLogin,
} from '../../utils/biometricLogin';

/** Matches the floor the Edge Function enforces, so the message arrives before the round trip. */
const MIN_LENGTH = 8;

export default function ChangePassword() {
  const router = useRouter();
  const { user } = useUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * The keychain is holding the OLD password if Face ID sign-in is set up for
   * this account. Leaving it there would make the Face ID button fail at the
   * next sign-in, so it is re-saved here while the new password is in hand.
   * Returns the biometric label when it was updated, so the success message can
   * say so, or null when there was nothing to update.
   */
  const resaveBiometricLogin = async (emailValue) => {
    try {
      const savedEmail = await getSavedBiometricEmail();
      if (
        !savedEmail ||
        !emailValue ||
        savedEmail.toLowerCase() !== emailValue.toLowerCase()
      ) {
        return null;
      }
      const saved = await saveBiometricLogin(emailValue, newPassword);
      if (!saved) return null;
      const { label } = await getBiometricCapability();
      return label;
    } catch (error) {
      // Never fail the password change over this. The saved sign-in repairs
      // itself the next time she signs in with the password anyway.
      console.warn('Could not re-save the biometric sign-in:', error?.message);
      return null;
    }
  };

  const handleUpdate = async () => {
    if (isSaving) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Almost there', 'Please fill in all three fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(
        'Those do not match',
        'The new password and the confirmation are different. Try typing the new one again?',
      );
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      Alert.alert(
        'A little longer, please',
        `Your new password needs at least ${MIN_LENGTH} characters.`,
      );
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert(
        'That is the one you already have',
        'Please pick a password that is different from your current one.',
      );
      return;
    }

    const emailValue = (user?.email || '').trim();

    try {
      setIsSaving(true);
      await API.changePassword(currentPassword, newPassword);

      const biometricLabel = await resaveBiometricLogin(emailValue);

      Alert.alert(
        'Password updated',
        biometricLabel
          ? `You will use the new one next time you sign in, and ${biometricLabel} now opens with it too.`
          : 'You will use the new one next time you sign in.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      // API.changePassword already turns the response into something readable,
      // and the backend's own wording ("Current password is incorrect.") is
      // what the user most often needs to see here.
      Alert.alert('Password not changed', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Standardized Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image
            source={require('../../../assets/icons/arrow-left.png')}
            style={{ width: 24, height: 24, tintColor: '#324E58' }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Current Password"
          placeholderTextColor="#6d6e72"
          secureTextEntry={!showCurrent}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
          // Lets iOS offer the saved password here, so the current one can be
          // filled with Face ID rather than typed from memory.
          textContentType="password"
          autoComplete="current-password"
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowCurrent(!showCurrent)}
          accessibilityRole="button"
          accessibilityLabel={
            showCurrent ? 'Hide current password' : 'Show current password'
          }
        >
          <Feather name={showCurrent ? 'eye' : 'eye-off'} size={18} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="New Password"
          placeholderTextColor="#6d6e72"
          secureTextEntry={!showNew}
          value={newPassword}
          onChangeText={setNewPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
          // Keeps the keychain in step: without this a changed password
          // leaves iOS filling the old one at the next sign-in.
          textContentType="newPassword"
          autoComplete="new-password"
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowNew(!showNew)}
          accessibilityRole="button"
          accessibilityLabel={showNew ? 'Hide new password' : 'Show new password'}
        >
          <Feather name={showNew ? 'eye' : 'eye-off'} size={18} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Confirm Password"
          placeholderTextColor="#6d6e72"
          secureTextEntry={!showConfirm}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSaving}
          textContentType="newPassword"
          autoComplete="new-password"
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowConfirm(!showConfirm)}
          accessibilityRole="button"
          accessibilityLabel={
            showConfirm ? 'Hide confirmed password' : 'Show confirmed password'
          }
        >
          <Feather name={showConfirm ? 'eye' : 'eye-off'} size={18} color="#888" />
        </TouchableOpacity>
      </View>

      <Text style={styles.helperText}>
        Use at least {MIN_LENGTH} characters. You can change it again any time.
      </Text>

      <TouchableOpacity
        style={[styles.submitButton, isSaving && styles.submitButtonDisabled]}
        onPress={handleUpdate}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel="Update password"
      >
        {isSaving ? (
          <View style={styles.submitBusy}>
            {/* White on the brand orange, per CLAUDE.md. */}
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.submitText}>Saving…</Text>
          </View>
        ) : (
          <Text style={styles.submitText}>Update Password</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingTop: 5,
  },
  backButton: {
    // Standard back button with no custom styling
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 32,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#324E58',
    // Leaves room for the eye button, which is absolutely positioned over the
    // right edge of the row.
    paddingRight: 36,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 14,
  },
  helperText: {
    fontSize: 13,
    color: '#6d6e72',
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#DB8633',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#DB8633',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
