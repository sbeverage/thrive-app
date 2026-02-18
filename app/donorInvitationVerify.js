// Donor Invitation Email Verification Screen
// Handles the complete donor invitation flow: verify token → create password → complete signup
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import API from './lib/api';
import { useUser } from './context/UserContext';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DonorInvitationVerifyScreen() {
  const route = useLocalSearchParams();
  const router = useRouter();
  const { saveUserData, uploadProfilePicture } = useUser();
  
  // Extract token from route params
  const token = route?.token || route?.verificationToken;
  
  // State management
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [coworking, setCoworking] = useState(false);
  const [sponsorAmount, setSponsorAmount] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(!!token);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  
  // Auto-verify token when component mounts
  useEffect(() => {
    if (token && !verified) {
      verifyToken(token);
    } else if (!token) {
      setError('No verification token provided');
      setVerifying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only run when token changes, not when verified changes
  
  /**
   * Verify the invitation token and get user info from backend
   */
  const verifyToken = async (verificationToken) => {
    try {
      setVerifying(true);
      setError('');
      
      console.log('🔍 Verifying donor invitation token...', verificationToken);
      
      // Call backend to verify token and get user info
      const response = await API.verifyDonorInvitation(verificationToken);
      
      if (response.success && response.user) {
        console.log('✅ Token verified successfully:', response.user);
        
        setEmail(response.user.email || '');
        setName(response.user.name || response.user.firstName || '');
        const isCoworkingInvite = response.user.coworking === true || response.user.inviteType === 'coworking';
        const rawSponsor = parseFloat(response.user.sponsorAmount || 0);
        setCoworking(isCoworkingInvite);
        setSponsorAmount(isCoworkingInvite ? (rawSponsor || 15) : rawSponsor);
        setVerified(true);
        setVerifying(false);
        
        // If in Safari/web, redirect to the same HTTPS Universal Link
        // This works with Resend emails because it's still an HTTPS link
        // Universal Links will catch it and open the app automatically
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          setTimeout(() => {
            try {
              // Use HTTPS Universal Link format - same approach that worked with Gmail
              const universalLink = `https://thrive-web-jet.vercel.app/verify-email?token=${verificationToken || ''}`;
              console.log('🔗 Redirecting to Universal Link:', universalLink);
              
              // Redirect to Universal Link - Universal Links will handle opening the app
              window.location.href = universalLink;
            } catch (error) {
              console.error('❌ Redirect failed:', error);
              // Fallback: Try custom scheme
              try {
                const deepLink = `thriveapp://verify-email?token=${verificationToken || ''}`;
                window.location.href = deepLink;
              } catch (fallbackError) {
                console.error('❌ Fallback redirect also failed:', fallbackError);
                // User will see the "Open in App" button to manually open
              }
            }
          }, 1500); // Wait 1.5 seconds before redirect
        }
      } else {
        throw new Error(response.error || 'Invalid or expired verification link');
      }
    } catch (error) {
      console.error('❌ Token verification error:', error);
      setError(error.message || 'Failed to verify email. Please check your connection.');
      setVerifying(false);
      
      Alert.alert(
        'Verification Failed',
        'This verification link is invalid or has expired. Please contact support or request a new invitation.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/login'),
          }
        ]
      );
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProfileImage(result.assets[0].uri);
    }
  };
  
  /**
   * Complete donor signup by creating password and account
   */
  const completeSignup = async () => {
    // Validation
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      console.log('🚀 Completing donor signup...', { email });

      let uploadedProfileUrl = null;
      if (profileImage) {
        try {
          const uploadResult = await uploadProfilePicture(profileImage);
          uploadedProfileUrl = uploadResult.imageUrl || null;
        } catch (uploadError) {
          console.error('❌ Profile picture upload failed:', uploadError);
        }
      }
      
      // Call backend to complete donor signup
      // This endpoint should:
      // 1. Verify the token is still valid
      // 2. Create the auth user account
      // 3. Update the donor record with auth_user_id
      // 4. Mark user as active
      // 5. Return auth token
      const response = await API.completeDonorInvitation({
        token: token,
        password: password,
        confirmPassword: confirmPassword,
        phone: phone,
        profileImageUrl: uploadedProfileUrl,
        coworking: coworking,
        inviteType: coworking ? 'coworking' : 'standard',
        sponsorAmount: sponsorAmount || 0
      });
      
      if (response.success) {
        console.log('✅ Donor signup completed successfully:', response);
        
        // Token is already stored by API.completeDonorInvitation method
        
        // Save user data to context
        await saveUserData({
          email: email,
          firstName: name.split(' ')[0] || '',
          lastName: name.split(' ').slice(1).join(' ') || '',
          phone: phone,
          profileImage: uploadedProfileUrl || null,
          profileImageUrl: uploadedProfileUrl || null,
          coworking: coworking,
          sponsorAmount: sponsorAmount || 0,
          monthlyDonation: coworking ? (sponsorAmount || 15) : undefined,
          isLoggedIn: true,
          isVerified: true,
        }, false); // Don't save to backend yet (already saved by API)
        
        // Show success message
        Alert.alert(
          '🎉 Welcome to Thrive!',
          coworking
            ? 'Your account is ready. Next, choose a charity for your coworking-sponsored donation.'
            : 'Your account has been successfully created. You can now access all features of the app.',
          [
            {
              text: 'Get Started',
              onPress: () => {
                if (coworking) {
                  router.replace({
                    pathname: '/signupFlow/explainerDonate',
                    params: { flow: 'coworking', sponsorAmount: (sponsorAmount || 15).toString() }
                  });
                } else {
                  router.replace('/(tabs)/home');
                }
              }
            }
          ]
        );
      } else {
        throw new Error(response.error || 'Failed to complete signup');
      }
    } catch (error) {
      console.error('❌ Signup completion error:', error);
      setError(error.message || 'Failed to complete signup. Please try again.');
      Alert.alert('Error', error.message || 'Failed to complete signup. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Loading state while verifying token
  if (verifying) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          style={styles.gradientBackground}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Verifying your email...</Text>
          <Text style={styles.loadingSubtext}>Please wait while we verify your invitation</Text>
          
          {/* Skip Verification Button (for testing) */}
          <TouchableOpacity 
            style={styles.skipButton}
            onPress={() => {
              Alert.alert(
                'Skip Verification',
                'This will skip email verification for testing purposes. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Skip',
                    onPress: () => {
                      console.log('⚠️ Skipping verification for testing');
                      setVerified(true);
                      setVerifying(false);
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.skipButtonText}>Skip Verification (Testing)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  
  // Error state if verification failed
  if (!verified && error) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          style={styles.gradientBackground}
        />
        <View style={styles.errorContainer}>
          <AntDesign name="closecircle" size={60} color="#ff4d4f" />
          <Text style={styles.errorTitle}>Verification Failed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
          
          {/* Skip Verification Button (for testing) */}
          <TouchableOpacity 
            style={styles.skipButton}
            onPress={() => {
              Alert.alert(
                'Skip Verification',
                'This will skip email verification for testing purposes. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Skip',
                    onPress: () => {
                      console.log('⚠️ Skipping verification for testing');
                      setVerified(true);
                      setError('');
                    }
                  }
                ]
              );
            }}
          >
            <Text style={styles.skipButtonText}>Skip Verification (Testing)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  
  // If in Safari/web and verified, show "Open in App" button instead of password form
  if (Platform.OS === 'web' && verified && typeof window !== 'undefined') {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          style={styles.gradientBackground}
        />
        <View style={styles.loadingContainer}>
          <Image 
            source={require('../assets/icons/check-circle.png')} 
            style={{ width: 60, height: 60, tintColor: '#4CAF50' }} 
          />
          <Text style={styles.loadingText}>Email Verified! 🎉</Text>
          <Text style={styles.loadingSubtext}>
            Your email has been verified. Please open the Thrive app to complete your signup.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              // Use the same HTTPS Universal Link approach that worked with Gmail
              // This works with Resend emails because it's still an HTTPS link
              try {
                const universalLink = `https://thrive-web-jet.vercel.app/verify-email?token=${token || ''}`;
                console.log('🔗 Redirecting to Universal Link:', universalLink);
                
                // Redirect to Universal Link - Universal Links will handle opening the app
                window.location.href = universalLink;
                
                // Fallback: Also try custom scheme if Universal Link doesn't work
                setTimeout(() => {
                  try {
                    const deepLink = `thriveapp://verify-email?token=${token || ''}`;
                    window.open(deepLink, '_blank');
                  } catch (fallbackError) {
                    console.error('❌ Fallback redirect failed:', fallbackError);
                  }
                }, 500);
              } catch (error) {
                console.error('❌ Error redirecting:', error);
                Alert.alert(
                  'Email Verified!',
                  'Your email has been verified. Please open the Thrive app on your device to complete your signup.',
                  [{ text: 'OK' }]
                );
              }
            }}
          >
            <Text style={styles.buttonText}>Open in App</Text>
          </TouchableOpacity>
          <Text style={styles.helpText}>
            If the app doesn't open automatically, tap the button above or open the Thrive app manually.
          </Text>
        </View>
      </View>
    );
  }
  
  // Main signup form (after verification) - only shown in native app
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <LinearGradient
        colors={['#2C3E50', '#4CA1AF']}
        style={styles.gradientBackground}
      />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <View style={styles.backButtonContainer}>
            <Image 
              source={require('../assets/icons/arrow-left.png')} 
              style={{ width: 24, height: 24, tintColor: '#333' }} 
            />
          </View>
        </TouchableOpacity>
        
        <View style={styles.contentCard}>
          <View style={styles.iconContainer}>
            <Image 
              source={require('../assets/images/piggy-email-verified.png')}
              style={styles.piggyImage}
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.header}>
            <Text style={styles.title}>Complete Your Signup</Text>
            <Text style={styles.subtitle}>Your email has been verified! 🎉</Text>
            <Text style={styles.description}>
              Create a password to finish setting up your account
            </Text>
          </View>
          
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={email}
                editable={false}
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            
            {name && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  value={name}
                  editable={false}
                  placeholder="Name"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={phone}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
                onChangeText={setPhone}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Profile Photo (Optional)</Text>
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.photoPreview} />
                ) : (
                  <Text style={styles.photoButtonText}>Upload Photo</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password *</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter password (min 8 characters)"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {Platform.OS === 'web' ? (
                    <Text>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                  ) : (
                    <AntDesign 
                      name={showPassword ? 'eye' : 'eyeo'} 
                      size={20} 
                      color="#6d6e72" 
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password *</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Confirm password"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {Platform.OS === 'web' ? (
                    <Text>{showConfirmPassword ? '👁️' : '👁️‍🗨️'}</Text>
                  ) : (
                    <AntDesign 
                      name={showConfirmPassword ? 'eye' : 'eyeo'} 
                      size={20} 
                      color="#6d6e72" 
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            
            {error && (
              <View style={styles.errorMessageContainer}>
                <AntDesign name="exclamationcircle" size={16} color="#ff4d4f" style={{ marginRight: 8 }} />
                <Text style={styles.errorMessage}>{error}</Text>
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={completeSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Complete Signup</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            {/* Skip Verification Button (for testing) */}
            <TouchableOpacity 
              style={styles.skipButton}
              onPress={() => {
                Alert.alert(
                  'Skip Verification',
                  'This will skip email verification and password creation for testing purposes. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Skip',
                      onPress: () => {
                        console.log('⚠️ Skipping verification and password creation for testing');
                        // Mark as verified and navigate to next step in signup flow
                        saveUserData({
                          email: email,
                          firstName: name.split(' ')[0] || '',
                          lastName: name.split(' ').slice(1).join(' ') || '',
                          isLoggedIn: true,
                          isVerified: true,
                        }, false).then(() => {
                          // Navigate to next step in signup flow
                          router.replace('/signupFlow/explainerDonate');
                        });
                      }
                    }
                  ]
                );
              }}
            >
              <Text style={styles.skipButtonText}>Skip Verification (Testing)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.35,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ff4d4f',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
  },
  backButtonContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    paddingTop: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'visible',
    marginTop: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
    position: 'absolute',
    top: -80,
    left: 0,
    right: 0,
    overflow: 'visible',
  },
  piggyImage: {
    width: 160,
    height: 160,
  },
  header: {
    marginTop: 30,
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#324E58',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#4CA1AF',
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#8c8c8c',
    textAlign: 'center',
    marginTop: 8,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#324E58',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#324E58',
  },
  photoButton: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    height: 80,
  },
  photoButtonText: {
    color: '#4CA1AF',
    fontSize: 14,
    fontWeight: '600',
  },
  photoPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: '#8c8c8c',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#324E58',
  },
  eyeButton: {
    padding: 12,
  },
  button: {
    backgroundColor: '#DB8633',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#DB8633',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#8c8c8c',
    fontSize: 14,
    fontWeight: '500',
  },
  errorMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f0',
    borderWidth: 1,
    borderColor: '#ffccc7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorMessage: {
    marginLeft: 8,
    fontSize: 14,
    color: '#ff4d4f',
    flex: 1,
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
    alignSelf: 'center',
  },
  skipButtonText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  helpText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  emojiIcon: {
    fontSize: 60,
    textAlign: 'center',
  },
});

