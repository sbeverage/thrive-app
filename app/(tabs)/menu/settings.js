import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';

export default function Settings() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <AntDesign name="arrowleft" size={24} color="#324E58" />
        <Text style={styles.header}>Settings</Text>
      </TouchableOpacity>



      {/* Notifications */}
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push('/(tabs)/menu/notifications')}
      >
        <View style={styles.rowLeft}>
          <Ionicons name="notifications-outline" size={18} color="#888" />
          <Text style={styles.text}>Notifications</Text>
        </View>
        <AntDesign name="right" size={16} color="#888" />
      </TouchableOpacity>

      {/* Auto Post */}
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push('/(tabs)/menu/autoPost')}
      >
        <View style={styles.rowLeft}>
          <Ionicons name="images-outline" size={18} color="#888" />
          <Text style={styles.text}>Auto Post</Text>
        </View>
        <AntDesign name="right" size={16} color="#888" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backButton: {
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
  header: {
    fontSize: 22,
    fontWeight: '600',
    color: '#21555B',
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
    paddingVertical: 20,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    fontSize: 14,
    color: '#324E58',
  },
});
