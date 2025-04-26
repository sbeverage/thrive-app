// app/beneficiaryCause.js

import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";

export default function BeneficiaryCause() {
  const router = useRouter();

  const [selectedCauses, setSelectedCauses] = useState([]);

  const causes = [
    "Childhood Illness",
    "Foster Care",
    "Disabilities",
    "Mental Health",
    "Animal Welfare",
    "Anti-Human Trafficking",
    "Rehabilitation",
    "Low Income Families",
    "Education",
  ];

  const handleToggleCause = (cause) => {
    setSelectedCauses((prevSelected) =>
      prevSelected.includes(cause)
        ? prevSelected.filter((c) => c !== cause)
        : [...prevSelected, cause]
    );
  };

  const handleContinue = () => {
    router.push("/nextStep"); // You can replace '/nextStep' with your real next page
  };

  const handleSkip = () => {
    router.replace("/guestHome");
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: "#fff", padding: 20 }}>
      {/* Back and Skip */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Image source={require("../assets/images/arrow-left.png")} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: "#DB8633", fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 10 }}>
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <Image source={require("../assets/images/walking-piggy.png")} style={{ width: 30, height: 24 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#F5F5FA", borderRadius: 10, marginHorizontal: 2 }} />
      </View>

      {/* Piggy and Chat Bubble */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 20 }}>
        <Image source={require("../assets/images/bolt-piggy.png")} style={{ width: 60, height: 60 }} />
        <View style={{ backgroundColor: "#F5F5FA", padding: 12, borderRadius: 8, marginLeft: 10, flex: 1 }}>
          <Text style={{ color: "#324E58", textAlign: "center" }}>
            For which cause you want to see beneficiaries?
          </Text>
        </View>
      </View>

      {/* Section Title */}
      <Text style={{ color: "#324E58", fontSize: 20, marginBottom: 20 }}>
        Beneficiaries Cause
      </Text>

      {/* Causes List */}
      <View style={{ gap: 20, marginBottom: 40 }}>
        {causes.map((cause) => (
          <TouchableOpacity key={cause} onPress={() => handleToggleCause(cause)}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: "#E1E1E5",
            }}>
              <Text style={{ fontSize: 16, color: "#324E58" }}>{cause}</Text>
              {selectedCauses.includes(cause) && (
                <Image source={require("../assets/images/checkmark.png")} style={{ width: 20, height: 20, tintColor: "#DB8633" }} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save and Continue Button */}
      <TouchableOpacity
        onPress={handleContinue}
        style={{
          backgroundColor: "#DB8633",
          paddingVertical: 15,
          borderRadius: 10,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>Save and continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
