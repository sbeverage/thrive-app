// app/components/SuccessModal.js

import React from "react";
import { View, Text, TouchableOpacity, Modal, Image } from "react-native";

export default function SuccessModal({ visible = true, message, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" }}>
        
        {/* Modal box */}
        <View style={{
          backgroundColor: "#fff",
          padding: 30,
          borderRadius: 16,
          alignItems: "center",
          width: 300,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 10,
          elevation: 10,
        }}>
          
          {/* Optional Celebration Icon */}
          <Image
            source={require("../assets/images/success-icon.png")} // if you have a cute success icon
            style={{ width: 80, height: 80, marginBottom: 20 }}
            resizeMode="contain"
          />

          {/* Success Message */}
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#324E58", textAlign: "center", marginBottom: 20 }}>
            {message}
          </Text>

          {/* OK Button */}
          <TouchableOpacity
            style={{ backgroundColor: "#DB8633", paddingVertical: 12, paddingHorizontal: 25, borderRadius: 8 }}
            onPress={onClose}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>OK</Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}
