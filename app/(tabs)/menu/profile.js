import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function UserProfile() {
  const router = useRouter();

  const handleDelete = () => {
    Alert.alert(
      'Are you sure?',
      'This action will permanently delete your profile. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Delete', style: 'destructive', onPress: () => console.log('User deleted') },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backRow} onPress={() => router.replace('/(tabs)/menu')}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.title}>User Profiles</Text>
      </TouchableOpacity>

      <Image source={require('../../../assets/images/profile.jpg')} style={styles.avatar} />
      <Text style={styles.name}>Stephanie Beverage</Text>
      <Text style={styles.email}>stephanie@gmail.com</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Phone</Text>
        <Text style={styles.infoValue}>(555) 1234 567</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Referral Code</Text>
        <Text style={styles.infoValue}>HJY448</Text>
      </View>

      <TouchableOpacity style={styles.editButton} onPress={() => router.push('/menu/editProfile')}>
        <Text style={styles.editText}>Edit Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.changePasswordButton} onPress={() => router.push('/menu/changePassword')}>
        <Text style={styles.changePasswordText}>Change Password</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteText}>Delete Account</Text>
      </TouchableOpacity>

      <Image source={require('../../../assets/images/qr.png')} style={styles.qrImage} />
      <Text style={styles.qrText}>Scan with your friend camera or QR Scanner and share profile</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 100,
    backgroundColor: '#fff',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    color: '#324E58',
    marginLeft: 10,
    fontWeight: '600',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginVertical: 16,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: '#324E58',
  },
  email: {
    fontSize: 14,
    textAlign: 'center',
    color: '#888',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: '#999',
  },
  infoValue: {
    fontSize: 16,
    color: '#324E58',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 30,
  },
  editText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  changePasswordButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  changePasswordText: {
    color: '#324E58',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  deleteButton: {
    borderWidth: 1.5,
    borderColor: 'red',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 14,
  },
  deleteText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  qrImage: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  qrText: {
    fontSize: 14,
    color: '#324E58',
    textAlign: 'center',
  },
});
