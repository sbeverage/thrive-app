import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather, AntDesign } from '@expo/vector-icons';
import SuggestCard from './SuggestCard';

/**
 * Compact stand-in for SuggestCard.
 *
 * The full form is tall, and on an empty search it was pushing the registry
 * results and the pick-later panel below the keyboard — the donor saw nothing
 * but "no results" and a big form. This shows a single-line invitation and
 * only opens the form once the donor asks for it.
 *
 * The form opens as a centred popup over a dimmed backdrop. Height is capped
 * on the wrapper directly inside the flex:1 centring container so the
 * percentage actually resolves, and the ScrollView inside can shrink and
 * scroll — the earlier bottom sheet capped a child of an auto-height parent,
 * so the constraint never applied and the submit button was clipped.
 */
export default function SuggestPrompt({ type = 'vendor', searchQuery = '', onSubmit }) {
  const [open, setOpen] = useState(false);
  const isVendor = type === 'vendor';

  return (
    <>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Feather name={isVendor ? 'shopping-bag' : 'heart'} size={16} color="#DB8633" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>
            {isVendor
              ? 'Know a great business you want to add?'
              : 'Know a great charity you want to add?'}
          </Text>
        </View>
        <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
          <Text style={styles.ctaText}>Request Now</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        {/* Tapping the dimmed area closes the popup. */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <KeyboardAvoidingView
            // flex:1 gives this a definite height (the screen), which is what
            // lets the popup's percentage maxHeight below actually resolve.
            // The earlier bottom sheet sized itself against a content-height
            // parent, so the constraint never computed and the submit button
            // was clipped.
            style={styles.centerer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Swallow taps on the popup itself so it doesn't close. */}
            <TouchableOpacity activeOpacity={1} style={styles.popupWrap}>
              <View style={styles.popup}>
                <View style={styles.popupHeader}>
                  <Text style={styles.popupTitle}>
                    {isVendor ? 'Request a business' : 'Request a charity'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setOpen(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <AntDesign name="close" size={20} color="#666" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.popupScroll}
                  contentContainerStyle={styles.popupScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <SuggestCard
                    type={type}
                    searchQuery={searchQuery}
                    onSubmit={onSubmit}
                    embedded
                  />
                </ScrollView>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#324E58',
    lineHeight: 18,
  },
  cta: {
    backgroundColor: '#DB8633',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 40, 0.55)',
  },
  centerer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  popupWrap: {
    width: '100%',
    maxWidth: 460,
    // The cap belongs HERE, not on `popup`. A percentage resolves against the
    // parent's definite height, and this element's parent (`centerer`) is
    // flex:1 — the screen. Put it on `popup` instead and it resolves against
    // this auto-height wrapper, i.e. not at all, which is exactly how the
    // submit button kept getting clipped.
    maxHeight: '85%',
  },
  popup: {
    width: '100%',
    flexShrink: 1,
    backgroundColor: '#fff',
    borderRadius: 22,
    overflow: 'hidden',
    paddingTop: 14,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 2,
  },
  popupTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#324E58',
  },
  popupScroll: {
    flexShrink: 1,
  },
  popupScrollContent: {
    paddingBottom: 8,
  },
});
