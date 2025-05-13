import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';

const ITEM_HEIGHT = 42;
const VISIBLE_ITEMS = 5;
const CENTER_INDEX = Math.floor(VISIBLE_ITEMS / 2);
const screenHeight = Dimensions.get('window').height;

export default function ScrollPicker({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  onConfirm,
}) {
  const scrollRef = useRef();
  const [internalValue, setInternalValue] = useState(selectedValue);

  const scrollToIndex = (index) => {
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  };

  const handleScrollEnd = (e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / ITEM_HEIGHT);
    setInternalValue(options[index]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.modalContainer}>
          <View style={styles.handleBar} />
          <Text style={styles.modalTitle}>{title}</Text>

          <View style={styles.pickerWrapper}>
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              contentContainerStyle={{
                paddingVertical: ITEM_HEIGHT * CENTER_INDEX,
              }}
              onMomentumScrollEnd={handleScrollEnd}
            >
              {options.map((item, index) => (
                <View key={index} style={styles.itemContainer}>
                  <Text
                    style={[
                      styles.itemText,
                      internalValue === item && styles.selectedItem,
                    ]}
                  >
                    {item}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.selectionOverlay} pointerEvents="none" />
          </View>

          <TouchableOpacity
            onPress={() => {
              onSelect(internalValue);
              onConfirm();
            }}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmText}>Download Report</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
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
  pickerWrapper: {
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    overflow: 'hidden',
  },
  itemContainer: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 18,
    color: '#999',
  },
  selectedItem: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#324E58',
  },
  selectionOverlay: {
    position: 'absolute',
    top: ITEM_HEIGHT * CENTER_INDEX,
    height: ITEM_HEIGHT,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  confirmButton: {
    marginTop: 24,
    backgroundColor: '#DB8633',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
