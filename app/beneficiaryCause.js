// app/beneficiaryCause.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

export default function BeneficiaryCause() {
  const router = useRouter();

  const [selectedCauses, setSelectedCauses] = useState([]);

  const causes = [
    'Childhood Illness',
    'Foster Care',
    'Disabilities',
    'Mental Health',
    'Animal Welfare',
    'Anti-Human Trafficking',
    'Rehabilitation',
    'Low Income Families',
    'Education',
  ];

  const toggleCause = (cause) => {
    if (selectedCauses.includes(cause)) {
      setSelectedCauses(selectedCauses.filter((c) => c !== cause));
    } else {
      setSelectedCauses([...selectedCauses, cause]);
    }
  };

  const handleSkip = () => {
    router.replace('/guestHome');
  };

  const handleBack = () => {
    router.back();
  };

  const handleContinue = () => {
    // Later we can save selectedCauses to backend or context!
    router.push('/nextStep');
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: '#fff', padding: 20 }}>
      {/* Top navigation */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={handleBack}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={{ color: '#DB8633', fontSize: 16 }}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 20 }}>
        <View style={{ width: 50, height: 5, backgroundColor: '#324E58', borderRadius: 5, marginHorizontal: 2 }} />
        <View style={{ width: 50, height: 5, backgroundColor: '#324E58', borderRadius: 5, marginHorizontal: 2 }} />
        <View style={{ width: 50, height: 5, backgroundColor: '#324E58', borderRadius: 5, marginHorizontal: 2 }} />
        <View style={{ width: 50, height: 5, backgroundColor: '#F5F5FA', borderRadius: 5, marginHorizontal: 2 }} />
      </View>

      {/* Walking Piggy */}
      <Image source={require('../assets/images/Walking-Piggy.png')} style={{ width: 50, height: 50, alignSelf: 'center' }} />

      {/* Speech Bubble */}
      <View style={{ backgroundColor: '#fff', borderColor: '#E1E1E5', borderWidth: 1, borderRadius: 20, padding: 10, marginVertical: 20 }}>
        <Text style={{ textAlign: 'center', color: '#324E58' }}>For which cause you want to see beneficiaries?</Text>
      </View>

      {/* Title */}
      <Text style={{ fontSize: 24, fontWeight: '600', color: '#324E58', marginBottom: 20 }}>Beneficiaries Cause</Text>

      {/* Causes List */}
      {causes.map((cause, idx) => (
        <TouchableOpacity
          key={idx}
          onPress={() => toggleCause(cause)}
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F5F5FA', paddingVertical: 15 }}
        >
          <Text style={{ fontSize: 16, color: '#324E58' }}>{cause}</Text>
          {selectedCauses.includes(cause) && (
            <AntDesign name="checkcircle" size={20} color="#DB8633" />
          )}
        </TouchableOpacity>
      ))}

      {/* Save and Continue Button */}
      <TouchableOpacity
        onPress={handleContinue}
        style={{ backgroundColor: '#DB8633', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 30 }}
      >
        <Text style={{ color: '#fff', fontSize: 16 }}>Save and continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
