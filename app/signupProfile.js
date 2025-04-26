import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import API from "./lib/api";

export default function SignupProfile() {
  const router = useRouter();
  const { email } = useLocalSearchParams();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const handleSubmit = async () => {
    if (!firstName || !lastName || !phoneNumber) {
      Alert.alert("Missing Info", "Please fill out all fields.");
      return;
    }

    try {
      const res = await API.post("/api/auth/save-profile", {
        email,
        firstName,
        lastName,
        phoneNumber,
      });

      console.log("✅ Profile saved:", res.data);
      router.replace("/beneficiary"); // ✅ Updated destination
    } catch (error) {
      console.error("❌ Profile save error:", error.response?.data || error.message);
      Alert.alert("Error", "Something went wrong while saving your profile.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>A Little More{"\n"}About You!</Text>

      <TextInput
        placeholder="First Name"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
      />
      <TextInput
        placeholder="Last Name"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        placeholderTextColor="#6d6e72"
      />
      <TextInput
        placeholder="Phone Number"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        style={styles.input}
        keyboardType="phone-pad"
        placeholderTextColor="#6d6e72"
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 100,
    paddingHorizontal: 20,
    flex: 1,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    color: "#324E58",
    marginBottom: 30,
    fontWeight: "bold",
    textAlign: "center",
  },
  input: {
    height: 48,
    backgroundColor: "#f5f5fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e1e5",
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#db8633",
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
  },
});
