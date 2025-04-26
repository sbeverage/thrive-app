// app/beneficiaryCause.js

import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image } from "react-native";
import { useRouter } from "expo-router";
import { AntDesign } from "@expo/vector-icons";

export default function BeneficiaryCause() {
  const router = useRouter();

  const [causes, setCauses] = useState([
    "Childhood Illness",
    "Foster Care",
    "Disabilities",
    "Mental Health",
    "Animal Welfare",
    "Anti-Human Trafficking",
    "Rehabilitation",
    "Low Income Families",
    "Education",
  ]);

  const [selectedCauses, setSelectedCauses] = useState([]);

  const toggleCause = (cause) => {
    if (selectedCauses.includes(cause)) {
      setSelectedCauses(selectedCauses.filter((item) => item !== cause));
    } else {
      setSelectedCauses([...selectedCauses, cause]);
    }
  };

  const handleContinue = () => {
    router.push("/nextStep"); // Placeholder for next screen
  };

  const handleSkip = () => {
    router.replace("/guestHome");
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: "#fff", padding: 20 }}>
      
      {/* Top Navigation */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <TouchableOpacity onPress={handleGoBack}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: "#DB8633", fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 30 }}>
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <Image source={require("../assets/images/walking-piggy.png")} style={{ width: 30, height: 24, resizeMode: "contain" }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#F5F5FA", borderRadius: 10, marginHorizontal: 2 }} />
      </View>

      {/* Piggy + Speech Bubble */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 30 }}>
        <Image source={require("../assets/images/bolt-piggy.png")} style={{ width: 80, height: 80, resizeMode: "contain", marginRight: 10 }} />
        <View style={{ backgroundColor: "#F5F5FA", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, flexShrink: 1 }}>
          <Text style={{ color: "#324E58", fontSize: 16 }}>
            For which cause you want to see beneficiaries?
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={{
        color: "#324E58",
        fontSize: 20,
        fontWeight: "700", // BOLD
        marginBottom: 20,
      }}>
        Beneficiaries Cause
      </Text>

      {/* List of Causes */}
      {causes.map((cause, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => toggleCause(cause)}
          style={{
            paddingVertical: 15,
            borderBottomWidth: 1,
            borderBottomColor: "#E1E1E5",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#324E58", fontSize: 16 }}>{cause}</Text>
          {selectedCauses.includes(cause) && (
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: "#DB8633",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}

      {/* Save and Continue Button */}
      <TouchableOpacity
        onPress={handleContinue}
        style={{
          backgroundColor: "#DB8633",
          paddingVertical: 15,
          borderRadius: 10,
          alignItems: "center",
          marginTop: 30,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>Save and continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}


