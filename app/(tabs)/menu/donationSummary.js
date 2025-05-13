// Full donationSummary.js with ScrollPicker integrated + fixes

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import ScrollPicker from '../../../components/ScrollPicker'; 

const YEARS = ['2023', '2024', '2025'];
const MONTHS = ['NOV', 'DEC', 'JAN', 'FEB', 'MAR'];

export default function DonationSummary() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState('monthly');
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);
  const [isYearModalVisible, setIsYearModalVisible] = useState(false);
  const [isMonthModalVisible, setIsMonthModalVisible] = useState(false);

  const [viewType, setViewType] = useState('monthly');
  const [selectedYear, setSelectedYear] = useState('2023');
  const [selectedMonth, setSelectedMonth] = useState('JAN');

  const handleDownloadIconPress = () => setFilterModalVisible(true);

  const applyFilter = () => {
    setFilterModalVisible(false);
    setTimeout(() => setIsYearModalVisible(true), 300);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/menu')}>
          <AntDesign name="arrowleft" size={24} color="#324E58" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Donation Summary</Text>
        <TouchableOpacity onPress={handleDownloadIconPress}>
          <Feather name="download" size={24} color="#324E58" />
        </TouchableOpacity>
      </View>

      {/* Totals */}
      <View style={styles.summaryRow}>
        <TouchableOpacity
          onPress={() => setViewMode('monthly')}
          style={[styles.summaryCard, viewMode === 'monthly' ? styles.cardActive : styles.cardInactive]}
        >
          <Text style={[styles.summaryAmount, viewMode !== 'monthly' && styles.cardInactiveText]}>$596</Text>
          <Text style={[styles.summaryLabel, viewMode !== 'monthly' && styles.cardInactiveText]}>Total Donation</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('oneTime')}
          style={[styles.summaryCard, viewMode === 'oneTime' ? styles.cardActive : styles.cardInactive]}
        >
          <Text style={[styles.summaryAmount, viewMode !== 'oneTime' && styles.cardInactiveText]}>$100</Text>
          <Text style={[styles.summaryLabel, viewMode !== 'oneTime' && styles.cardInactiveText]}>Total One Time Gifts</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView contentContainerStyle={styles.listContent}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View style={styles.row} key={i}>
            <Text style={styles.rowLabel}>Month {i + 1}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowAmount}>$15</Text>
              <AntDesign name="right" size={16} color="#324E58" style={{ marginLeft: 5 }} />
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={isFilterModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterModalVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={() => {}}>
            <View style={styles.handleBar} />
            <Text style={styles.modalTitle}>Filters</Text>
            {['monthly', 'yearly'].map((type) => (
              <TouchableOpacity key={type} style={styles.checkboxRow} onPress={() => setViewType(type)}>
                <View style={[styles.checkbox, viewType === type && styles.checkboxSelected]}>
                  {viewType === type && <AntDesign name="check" size={14} color="#fff" />}
                </View>
                <Text style={styles.checkboxLabel}>{type === 'monthly' ? 'Monthly View' : 'Yearly View'}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalButton} onPress={applyFilter}>
              <Text style={styles.modalButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Year Scroll Picker */}
      <ScrollPicker
        visible={isYearModalVisible}
        title="Select Year"
        options={YEARS}
        selectedValue={selectedYear}
        onSelect={setSelectedYear}
        onConfirm={() => {
          setIsYearModalVisible(false);
          if (viewType === 'monthly') setIsMonthModalVisible(true);
          else Alert.alert('📄 Downloading PDF', `Yearly report for ${selectedYear}`);
        }}
        onClose={() => setIsYearModalVisible(false)}
      />

      {/* Month Scroll Picker */}
      <ScrollPicker
        visible={isMonthModalVisible}
        title="Select Month"
        options={MONTHS}
        selectedValue={selectedMonth}
        onSelect={setSelectedMonth}
        onConfirm={() => {
          setIsMonthModalVisible(false);
          Alert.alert('📄 Downloading PDF', `Monthly report for ${selectedMonth} ${selectedYear}`);
        }}
        onClose={() => setIsMonthModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#324E58' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    marginHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  cardActive: { backgroundColor: '#DB8633' },
  cardInactive: { backgroundColor: '#F5F5FA' },
  cardInactiveText: { color: '#324E58' },
  summaryAmount: { fontSize: 24, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 14, color: '#fff' },
  listContent: { padding: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowLabel: { fontSize: 16, color: '#324E58' },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowAmount: { fontSize: 16, fontWeight: '500', color: '#324E58' },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    color: '#324E58',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  checkbox: {
    height: 20,
    width: 20,
    borderWidth: 2,
    borderColor: '#DB8633',
    borderRadius: 4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#DB8633',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#324E58',
  },
  modalButton: {
    marginTop: 20,
    backgroundColor: '#DB8633',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
