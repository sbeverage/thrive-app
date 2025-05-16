// Updated to restore arrow and heart icon on each card
import React, { useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Modal,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { AntDesign, Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';
import SuccessModal from '../../../components/SuccessModal';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useBeneficiary } from '../../context/BeneficiaryContext';

export default function BeneficiaryScreen() {
  const router = useRouter();
  const { selectedBeneficiary, setSelectedBeneficiary } = useBeneficiary();

  const [searchText, setSearchText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [confettiTrigger, setConfettiTrigger] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingBeneficiary, setPendingBeneficiary] = useState(null);
  const [favorites, setFavorites] = useState([]);

  const beneficiaries = [
    { id: 1, name: 'NPCF', category: 'Childhood Illness', image: require('../../../assets/images/child-cancer.jpg') },
    { id: 2, name: 'Humane Society', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
    { id: 3, name: 'Charity Water', category: 'Low Income Families', image: require('../../../assets/images/charity-water.jpg') },
    { id: 4, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
    { id: 5, name: 'NPCF', category: 'Childhood Illness', image: require('../../../assets/images/child-cancer.jpg') },
    { id: 6, name: 'Humane Society', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
    { id: 7, name: 'Charity Water', category: 'Low Income Families', image: require('../../../assets/images/charity-water.jpg') },
    { id: 8, name: 'Dog Trust', category: 'Animal Welfare', image: require('../../../assets/images/humane-society.jpg') },
  ];

  const filteredBeneficiaries = beneficiaries.filter(b =>
    b.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleConfirmBeneficiary = () => {
    if (pendingBeneficiary) {
      setSelectedBeneficiary(pendingBeneficiary);
      setSuccessMessage("Awesome! You've selected your cause!");
      setShowSuccessModal(true);
      setConfettiTrigger(true);
      setConfirmModalVisible(false);
      setPendingBeneficiary(null);
    }
  };

  const toggleFavorite = id => {
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const closeModal = () => {
    setShowSuccessModal(false);
    setSearchText('');
  };

  const sheetRef = useRef(null);
  const snapPoints = useMemo(() => ['25%', '95%'], []);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: 37.78825,
            longitude: -122.4324,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Circle
            center={{ latitude: 37.78825, longitude: -122.4324 }}
            radius={700}
            strokeColor="#D0861F"
            fillColor="rgba(208,134,31,0.1)"
          />
          {beneficiaries.map(b => (
            <Marker
              key={b.id}
              coordinate={{ latitude: 37.78825 + b.id * 0.001, longitude: -122.4324 }}
              title={b.name}
              description={b.category}
            />
          ))}
        </MapView>

        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={false}
          backgroundStyle={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#324E58', marginBottom: 16 }}>Beneficiaries</Text>

              {selectedBeneficiary && (
                <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFEAD2', borderWidth: 2, borderColor: '#DB8633', marginBottom: 16 }}>
                  <Image source={selectedBeneficiary.image} style={{ width: '100%', height: 120, resizeMode: 'cover' }} />
                  <View style={{ position: 'absolute', bottom: 10, left: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{selectedBeneficiary.name}</Text>
                    <Text style={{ fontSize: 12, color: '#fff' }}>{selectedBeneficiary.category}</Text>
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5fa', borderRadius: 8, borderWidth: 1, borderColor: '#e1e1e5', paddingHorizontal: 10, marginBottom: 16 }}>
                <AntDesign name="search1" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Search Beneficiaries"
                  placeholderTextColor="#6d6e72"
                  value={searchText}
                  onChangeText={setSearchText}
                  style={{ flex: 1, height: 48, fontSize: 16, color: '#324E58' }}
                />
                <TouchableOpacity onPress={() => router.push('/(tabs)/beneficiary/beneficiaryFilter')} style={{ marginLeft: 10 }}>
                  <Feather name="filter" size={22} color="#DB8633" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
              {filteredBeneficiaries.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  {filteredBeneficiaries.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => {
                        setPendingBeneficiary(b);
                        setConfirmModalVisible(true);
                      }}
                      style={{
                        width: '48%',
                        backgroundColor: '#F5F5FA',
                        borderRadius: 10,
                        marginBottom: 20,
                        overflow: 'hidden',
                        borderWidth: selectedBeneficiary?.id === b.id ? 2 : 0,
                        borderColor: selectedBeneficiary?.id === b.id ? '#DB8633' : 'transparent',
                        position: 'relative',
                      }}
                    >
                      <Image source={b.image} style={{ width: '100%', height: 100, resizeMode: 'cover' }} />
                      <TouchableOpacity onPress={() => toggleFavorite(b.id)} style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                        <AntDesign
                          name={favorites.includes(b.id) ? 'heart' : 'hearto'}
                          size={20}
                          color="#DB8633"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/(tabs)/beneficiary/beneficiaryDetail', params: { id: b.id.toString() } })}
                        style={{ position: 'absolute', right: 10, bottom: 10 }}
                      >
                        <AntDesign name="right" size={16} color="#6d6e72" />
                      </TouchableOpacity>
                      <View style={{ padding: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#324E58', marginBottom: 4 }}>{b.name}</Text>
                        <Text style={{ fontSize: 12, color: '#6d6e72' }}>{b.category}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', marginTop: 20 }}>
                  <Text style={{ fontSize: 16, color: '#aaa', marginBottom: 10 }}>No results found for “{searchText}”</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#324E58', textAlign: 'center', marginBottom: 20 }}>
                    Want to see “{searchText}” here? Drop their info below!
                  </Text>

                  {submitted ? (
                    <Text style={{ color: '#324E58', fontWeight: '600', marginTop: 20 }}>
                      ✅ Request submitted! Thank you — we’ll review and add them soon.
                    </Text>
                  ) : (
                    <>
                      <TextInput
                        value={businessName}
                        onChangeText={setBusinessName}
                        placeholder="Full Business Name"
                        placeholderTextColor="#999"
                        style={styles.input}
                      />
                      <TextInput
                        value={businessUrl}
                        onChangeText={setBusinessUrl}
                        placeholder="Website URL"
                        placeholderTextColor="#999"
                        autoCapitalize="none"
                        style={styles.input}
                      />
                      <TouchableOpacity
                        style={styles.requestButton}
                        onPress={() => {
                          if (businessName.trim() && businessUrl.trim()) {
                            setSubmitted(true);
                          } else {
                            alert('Please fill out both fields.');
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Submit Request</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </BottomSheet>

        <Modal visible={confirmModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.confirmModalBox}>
              <Text style={styles.modalText}>Are you sure you want "{pendingBeneficiary?.name}" to be your new beneficiary?</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={handleConfirmBeneficiary} style={styles.confirmBtn}>
                  <Text style={{ color: 'white', fontWeight: '700' }}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmModalVisible(false)} style={styles.cancelBtn}>
                  <Text style={{ color: '#324E58', fontWeight: '700' }}>No</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <SuccessModal visible={showSuccessModal} onClose={closeModal} message={successMessage} />
        {confettiTrigger && (
          <ConfettiCannon
            count={100}
            origin={{ x: 200, y: 0 }}
            fadeOut
            explosionSpeed={350}
            fallSpeed={3000}
            onAnimationEnd={() => setConfettiTrigger(false)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: '#324E58',
    width: '100%',
  },
  requestButton: {
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmModalBox: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    width: '85%',
    alignItems: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#324E58',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#DB8633',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});
