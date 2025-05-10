import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ScrollView,
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
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.headerText}>Edit Profile</Text>
      </TouchableOpacity>

      <View style={styles.imageContainer}>
        <Image
          source={require('../../../assets/images/profile.jpg')}
          style={styles.profileImage}
        />
        <TouchableOpacity style={styles.imageIcon}>
          <AntDesign name="picture" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={styles.rowInputs}>
        <View style={styles.searchContainerHalf}>
          <TextInput
            style={styles.searchInput}
            placeholder="First Name"
            placeholderTextColor="#6d6e72"
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>
        <View style={styles.searchContainerHalf}>
          <TextInput
            style={styles.searchInput}
            placeholder="Last Name"
            placeholderTextColor="#6d6e72"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Phone"
          placeholderTextColor="#6d6e72"
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Email"
          placeholderTextColor="#6d6e72"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleUpdate}>
        <Text style={styles.saveText}>Update Changes</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
    flexGrow: 1,
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
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  searchContainerHalf: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 10,
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
  },
  saveButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#DB8633',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
