import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";

export default function Beneficiary() {
  const router = useRouter();

  const [supportOptions, setSupportOptions] = useState([
    {
      id: "local",
      name: "Local",
      image: require("../assets/images/local-icon.png"),
      selected: true,
    },
    {
      id: "national",
      name: "National",
      image: require("../assets/images/national-icon.png"),
      selected: false,
    },
    {
      id: "international",
      name: "International",
      image: require("../assets/images/international-icon.png"),
      selected: false,
    },
  ]);

  const [sizeOptions, setSizeOptions] = useState([
    { id: "small", name: "Small", selected: true },
    { id: "medium", name: "Medium", selected: false },
    { id: "large", name: "Large", selected: false },
  ]);

  const handleSupportSelect = (id) => {
    setSupportOptions((prev) =>
      prev.map((opt) => ({ ...opt, selected: opt.id === id }))
    );
  };

  const handleSizeSelect = (id) => {
    setSizeOptions((prev) =>
      prev.map((opt) => ({ ...opt, selected: opt.id === id }))
    );
  };

  const handleContinue = () => {
    router.push("/nextStep");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <View style={styles.progressBarWrapper}>
        <View style={styles.progressDotActive} />
        <View style={styles.progressDotActive} />
        <View style={styles.progressDotInactive} />
        <View style={styles.progressDotInactive} />
      </View>

      <Image
        source={require("../assets/images/piggy-with-flowers.png")}
        style={styles.piggy}
      />

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>Who do you want to donate to?</Text>
      </View>

      <Text style={styles.sectionTitle}>Who they support</Text>

      <View style={styles.optionRow}>
        {supportOptions.map((option) => (
          <TouchableOpacity key={option.id} onPress={() => handleSupportSelect(option.id)}>
            <View
              style={[
                styles.supportCard,
                option.selected && styles.selectedBorder,
              ]}
            >
              <Image source={option.image} style={styles.optionImage} />
              <Text
                style={[
                  styles.optionText,
                  option.selected && styles.selectedText,
                ]}
              >
                {option.name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Size of organization</Text>

      <View style={styles.sizeRow}>
        {sizeOptions.map((option) => (
          <TouchableOpacity key={option.id} onPress={() => handleSizeSelect(option.id)}>
            <View
              style={[
                styles.sizeButton,
                option.selected && styles.selectedSize,
              ]}
            >
              <Text
                style={[
                  styles.sizeText,
                  option.selected && styles.selectedSizeText,
                ]}
              >
                {option.name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
        <Text style={styles.continueText}>Save and continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    padding: 20,
    alignItems: "center",
  },
  backButton: {
    alignSelf: "flex-start",
  },
  backArrow: {
    fontSize: 24,
    color: "#324E58",
  },
  piggy: {
    width: 80,
    height: 80,
    resizeMode: "contain",
    marginVertical: 10,
  },
  questionBox: {
    borderWidth: 1,
    borderColor: "#dbdbdb",
    borderRadius: 10,
    padding: 10,
    width: "100%",
    marginBottom: 15,
  },
  questionText: {
    color: "#324E58",
    fontSize: 14,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    color: "#324E58",
    marginVertical: 10,
    alignSelf: "flex-start",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 20,
  },
  supportCard: {
    backgroundColor: "#f5f5fa",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    width: 90,
    height: 120,
  },
  selectedBorder: {
    borderWidth: 2,
    borderColor: "#db8633",
  },
  optionImage: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  optionText: {
    color: "#324E58",
    fontSize: 14,
    textAlign: "center",
  },
  selectedText: {
    color: "#db8633",
  },
  sizeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 30,
  },
  sizeButton: {
    backgroundColor: "#ebebf0",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e1e1e5",
  },
  selectedSize: {
    backgroundColor: "#db86331a",
    borderColor: "#db8633",
  },
  sizeText: {
    color: "#979797",
  },
  selectedSizeText: {
    color: "#db8633",
  },
  continueButton: {
    backgroundColor: "#db8633",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: "100%",
  },
  continueText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  progressBarWrapper: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 15,
  },
  progressDotActive: {
    width: 40,
    height: 5,
    backgroundColor: "#324e58",
    borderRadius: 10,
  },
  progressDotInactive: {
    width: 40,
    height: 5,
    backgroundColor: "#f5f5fa",
    borderRadius: 10,
  },
});
