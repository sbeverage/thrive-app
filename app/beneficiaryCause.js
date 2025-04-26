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

  const toggleCause = (cause) => {
    if (selectedCauses.includes(cause)) {
      setSelectedCauses((prev) => prev.filter((c) => c !== cause));
    } else {
      setSelectedCauses((prev) => [...prev, cause]);
    }
  };

  const handleContinue = () => {
    // Save selected causes or move forward
    router.push("/nextStep"); // Replace with your real next step later
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

      {/* Main content */}
      <Image
        source={require("../assets/images/bolt-piggy.png")}
        style={{ width: 80, height: 80, alignSelf: "center", marginVertical: 10 }}
      />

      <View style={{ backgroundColor: "#F5F5FA", padding: 12, borderRadius: 8, marginVertical: 10 }}>
        <Text style={{ color: "#324E58", textAlign: "center" }}>
          For which cause you want to see beneficiaries?
        </Text>
      </View>

      <Text style={{ color: "#324E58", fontSize: 18, marginTop: 20, marginBottom: 10 }}>Beneficiaries Cause</Text>

      {causes.map((cause) => (
        <TouchableOpacity
          key={cause}
          onPress={() => toggleCause(cause)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F5F5FA",
          }}
        >
          <Text style={{ color: "#324E58", fontSize: 16 }}>{cause}</Text>
          {selectedCauses.includes(cause) && (
            <Image
              source={require("../assets/images/checkmark.png")}
              style={{ width: 20, height: 20, tintColor: "#DB8633" }}
            />
          )}
        </TouchableOpacity>
      ))}

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
