import { ArrowLeftIcon } from "lucide-react";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";

export default function Beneficiary() {
  const router = useRouter();

  const [supportOptions, setSupportOptions] = useState([
    { id: "local", name: "Local", image: require("../assets/images/group.png"), selected: true },
    { id: "national", name: "National", image: require("../assets/images/group-1.png"), selected: false },
    { id: "international", name: "International", image: require("../assets/images/walking-piggy.png"), selected: false },
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
    // In future: Save selected support + size options to backend or global state
    router.push("/nextStep"); // Change '/nextStep' to your actual next screen route
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: "#fff", padding: 20 }}>
      <Button variant="ghost" onPress={() => router.back()}>
        <ArrowLeftIcon size={24} color="#324E58" />
      </Button>

      <Progress value={50} className="my-4" />

      <Text style={{ fontSize: 16, color: "#324E58", marginBottom: 10 }}>Who do you want to donate to?</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 20 }}>
        {supportOptions.map((option) => (
          <TouchableOpacity key={option.id} onPress={() => handleSupportSelect(option.id)}>
            <Card style={{ borderColor: option.selected ? "#DB8633" : "#E1E1E5", borderWidth: 2, padding: 10, borderRadius: 8 }}>
              <Image source={option.image} style={{ width: 50, height: 50 }} />
              <Text style={{ textAlign: "center", color: option.selected ? "#DB8633" : "#324E58" }}>{option.name}</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ fontSize: 16, color: "#324E58", marginBottom: 10 }}>Size of organization</Text>

      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 30 }}>
        {sizeOptions.map((option) => (
          <TouchableOpacity key={option.id} onPress={() => handleSizeSelect(option.id)}>
            <Card style={{ borderColor: option.selected ? "#DB8633" : "#E1E1E5", borderWidth: 2, padding: 10, borderRadius: 8 }}>
              <Text style={{ color: option.selected ? "#DB8633" : "#324E58" }}>{option.name}</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      <Button onPress={handleContinue} className="bg-[#db8633]">
        Save and Continue
      </Button>
    </ScrollView>
  );
}
