import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function EditProfileScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('Stephanie');
  const [lastName, setLastName] = useState('Beverage');
  const [phone, setPhone] = useState('(555) 123 4567');
  const [email, setEmail] = useState('stephanie@gmail.com');

  const handleUpdate = () => {
    Alert.alert('🎉 Changes Saved!', 'Your profile has been updated.', [
      { text: 'OK', onPress: () => router.push('/menu/profile') },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.headerText}>Edit Profile</Text>
      </TouchableOpacity>

      {/* Profile Picture */}
      <View style={styles.imageContainer}>
        <Image
          source={require('../../../assets/images/profile.jpg')}
          style={styles.profileImage}
        />
        <TouchableOpacity style={styles.imageIcon}>
          <AntDesign name="picture" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      {/* Input Fields */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.inputHalf}
          placeholder="First Name"
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextInput
          style={styles.inputHalf}
          placeholder="Last Name"
          value={lastName}
          onChangeText={setLastName}
        />
      </View>

      <TextInput
        style={styles.fullInput}
        placeholder="Phone"
        value={phone}
        onChangeText={setPhone}
      />

      <TextInput
        style={styles.fullInput}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />

      {/* Update Button */}
      <TouchableOpacity style={styles.saveButton} onPress={handleUpdate}>
        <Text style={styles.saveText}>Update Changes</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
    flex: 1,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
    color: '#324E58',
  },
  imageContainer: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  imageIcon: {
    position: 'absolute',
    bottom: 0,
    right: -5,
    backgroundColor: '#f1f1f1',
    padding: 6,
    borderRadius: 16,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  inputHalf: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f4f4f8',
    fontSize: 16,
  },
  fullInput: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f4f4f8',
    fontSize: 16,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    elevation: 2,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
