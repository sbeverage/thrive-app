import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import API from "./lib/api";

export default function SignupProfile() {
  const router = useRouter();
  const { name, email } = useLocalSearchParams();

  const [firstName, setFirstName] = useState(name?.split(" ")[0] || "");
  const [lastName, setLastName] = useState(name?.split(" ")[1] || "");
  const [phoneNumber, setPhoneNumber] = useState("");

  const formatPhone = (value) => {
    const cleaned = ("" + value).replace(/\D/g, "");
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{0,4})$/);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return value;
  };

  const handleSaveProfile = async () => {
    try {
      const res = await API.post("/auth/save-profile", {
        email,
        firstName,
        lastName,
        phoneNumber,
      });
      console.log("✅ Profile saved:", res.data);
      router.replace("/home"); // ✅ Change if your homepage is different
    } catch (error) {
      console.error("❌ Profile save error:", error.response?.data || error.message);
      Alert.alert("Error", "Something went wrong. Please try again later.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backArrow} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#324e58" />
      </TouchableOpacity>

      {/* Pig & Bubble */}
      <View style={styles.heroContainer}>
        <Image source={require("../assets/images/bolt-piggy.png")} style={styles.piggy} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            <Text style={{ color: "#324e58" }}>A Little More{"\n"}</Text>
            <Text style={{ color: "#db8633" }}>About You!</Text>
          </Text>
        </View>
      </View>

      {/* Profile Picture */}
      <View style={styles.avatarContainer}>
        <Image source={require("../assets/images/Avatar-large.png")} style={styles.avatar} />
        <TouchableOpacity style={styles.editAvatar}>
          <Ionicons name="image" size={20} color="#324e58" />
        </TouchableOpacity>
      </View>

      {/* Input Fields */}
      <View style={styles.formContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="First Name"
            value={firstName}
            onChangeText={(text) => setFirstName(text)}
            style={styles.input}
            autoCapitalize="words"
            placeholderTextColor="#6d6e72"
          />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="Last Name"
            value={lastName}
            onChangeText={(text) => setLastName(text)}
            style={styles.input}
            autoCapitalize="words"
            placeholderTextColor="#6d6e72"
          />
        </View>
        <View style={styles.inputWrapper}>
          <TextInput
            placeholder="Phone Number"
            value={formatPhone(phoneNumber)}
            onChangeText={(text) => setPhoneNumber(text)}
            style={styles.input}
            keyboardType="phone-pad"
            placeholderTextColor="#6d6e72"
          />
        </View>
      </View>

      {/* Continue Button */}
      <TouchableOpacity style={styles.continueButton} onPress={handleSaveProfile}>
        <Text style={styles.continueText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    alignItems: "center",
    backgroundColor: "#fff",
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  backArrow: {
    alignSelf: "flex-start",
    marginLeft: 10,
    marginBottom: 10,
  },
  heroContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 20,
  },
  piggy: {
    width: 69,
    height: 76,
    resizeMode: "contain",
  },
  bubble: {
    backgroundColor: "#f5f5fa",
    padding: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    width: 238,
    height: 94,
  },
  bubbleText: {
    fontSize: 24,
    textAlign: "center",
    lineHeight: 34,
  },
  avatarContainer: {
    marginVertical: 20,
    alignItems: "center",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#fff",
  },
  editAvatar: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#f5f5fa",
    borderRadius: 21,
    padding: 10,
    borderWidth: 2,
    borderColor: "#fff",
  },
  formContainer: {
    width: "100%",
  },
  inputWrapper: {
    backgroundColor: "#f5f5fa",
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e1e1e5",
  },
  input: {
    fontSize: 14,
    color: "#324e58",
  },
  continueButton: {
    backgroundColor: "#db8633",
    borderRadius: 8,
    width: "100%",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  continueText: {
    color: "#fff",
    fontSize: 16,
  },
});
