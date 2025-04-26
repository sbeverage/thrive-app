// app/beneficiary.js

import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, ScrollView } from "react-native";

export default function Beneficiary() {
  const router = useRouter();

  const [supportOptions, setSupportOptions] = useState([
    { id: "local", name: "Local", image: require("../assets/images/local-pin.png"), selected: true },
    { id: "national", name: "National", image: require("../assets/images/national.png"), selected: false },
    { id: "international", name: "International", image: require("../assets/images/international.png"), selected: false },
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
    router.push("/beneficiaryCause"); // 🌟 updated to point to the next page
  };

  const handleSkip = () => {
    router.replace("/guestHome");
  };

  const handleBack = () => {
    router.replace("/signupProfile"); // 🌟 new function so left arrow always goes back to profile page
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: "#fff", padding: 20 }}>
      {/* Back and Skip */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <TouchableOpacity onPress={handleBack}>
          <Image source={require("../assets/images/back-arrow.png")} style={{ width: 24, height: 24 }} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: "#DB8633", fontSize: 14 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 10 }}>
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#324E58", borderRadius: 10, marginHorizontal: 2 }} />
        <Image source={require("../assets/images/Walking Piggy.png")} style={{ width: 30, height: 24 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#F5F5FA", borderRadius: 10, marginHorizontal: 2 }} />
        <View style={{ flex: 1, height: 4, backgroundColor: "#F5F5FA", borderRadius: 10, marginHorizontal: 2 }} />
      </View>

      {/* Main content */}
      <Image
        source={require("../assets/images/walking-piggy.png")}
        style={{ width: 80, height: 80, alignSelf: "center", marginVertical: 10 }}
      />

      <View style={{ backgroundColor: "#F5F5FA", padding: 12, borderRadius: 8, marginVertical: 10 }}>
        <Text style={{ color: "#324E58", textAlign: "center" }}>Who do you want to donate to?</Text>
      </View>

      <Text style={{ color: "#324E58", fontSize: 18, marginTop: 20, marginBottom: 10 }}>Who they support</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 20 }}>
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
            <Text
              style={{
                textAlign: "center",
                color: option.selected ? "#DB8633" : "#324E58",
                fontSize: 14,
                marginTop: 5,
              }}
            >
              {option.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color: "#324E58", fontSize: 18, marginBottom: 10 }}>Size of organization</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 20 }}>
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
              <Text
                style={{
                  color: option.selected ? "#DB8633" : "#324E58",
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                {option.name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        onPress={handleContinue}
        style={{
          backgroundColor: "#DB8633",
          paddingVertical: 15,
          borderRadius: 10,
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16 }}>Save and continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
