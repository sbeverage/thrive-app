// app/beneficiary.js

import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";

export default function Beneficiary() {
  const router = useRouter();

  const [supportOptions, setSupportOptions] = useState([
    { id: "local", name: "Local", image: require("../assets/images/local-icon.png"), selected: true },
    { id: "national", name: "National", image: require("../assets/images/national-icon.png"), selected: false },
    { id: "international", name: "International", image: require("../assets/images/international-icon.png"), selected: false },
  ]);

  const [sizeOptions, setSizeOptions] = useState([
    { id: "small", name: "Small", selected: true },
    { id: "medium", name: "Medium", selected: false },
    { id: "large", name: "Large", selected: false },
  ]);

  const handleSupportSelect = (id) => {
    setSupportOptions((prev) => prev.map((opt) => ({ ...opt, selected: opt.id === id })));
  };

  const handleSizeSelect = (id) => {
    setSizeOptions((prev) => prev.map((opt) => ({ ...opt, selected: opt.id === id })));
  };

  const handleContinue = () => {
    router.push("/beneficiaryCause");
  };

  const handleSkip = () => {
    router.replace("/guestHome");
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: "#fff", padding: 20 }}>
      {/* Top Bar */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <TouchableOpacity onPress={() => router.replace("/signupProfile")}> {/* fixed */}
          <Image source={require("../assets/images/arrow-left.png")} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: "#DB8633", fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <Image source={require("../assets/images/walking-piggy.png")} style={{ width: 30, height: 24 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#F5F5FA", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#F5F5FA", borderRadius: 10, marginHorizontal: 2 }} />
      </View>

      {/* Piggy + Bubble */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginVertical: 10 }}>
        <Image source={require("../assets/images/bolt-piggy.png")} style={{ width: 60, height: 60, marginRight: 8 }} />
        <View style={{ backgroundColor: "#F5F5FA", padding: 10, borderRadius: 8 }}>
          <Text style={{ color: "#324E58", fontSize: 14 }}>Who do you want to donate to?</Text>
        </View>
      </View>

      {/* Section: Who they support */}
      <Text style={{ color: "#324E58", fontSize: 18, marginTop: 20, marginBottom: 10 }}>Who they support</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 30 }}>
        {supportOptions.map((option) => (
          <TouchableOpacity key={option.id} onPress={() => handleSupportSelect(option.id)}>
            <View
              style={{
                width: 90,
                height: 90,
                borderRadius: 16,
                backgroundColor: "#F5F5FA",
                borderWidth: option.selected ? 2 : 0,
                borderColor: option.selected ? "#DB8633" : "transparent",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <Image source={option.image} style={{ width: 40, height: 40 }} />
            </View>
            <Text style={{ textAlign: "center", color: option.selected ? "#DB8633" : "#324E58", fontSize: 14, marginTop: 5 }}>
              {option.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Section: Size of organization */}
      <Text style={{ color: "#324E58", fontSize: 18, marginBottom: 10 }}>Size of organization</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 30 }}>
        {sizeOptions.map((option) => (
          <TouchableOpacity key={option.id} onPress={() => handleSizeSelect(option.id)}>
            <View
              style={{
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
                backgroundColor: option.selected ? "#FFEAD2" : "#F5F5FA",
                borderWidth: option.selected ? 1 : 0,
                borderColor: option.selected ? "#DB8633" : "transparent",
              }}
            >
              <Text style={{ color: option.selected ? "#DB8633" : "#324E58", fontSize: 14, textAlign: "center" }}>{option.name}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save & Continue Button */}
      <TouchableOpacity
        onPress={handleContinue}
        style={{ backgroundColor: "#DB8633", paddingVertical: 15, borderRadius: 10, alignItems: "center" }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>Save and continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
