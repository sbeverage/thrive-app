// The ask for background location, in our words, before Apple asks in theirs.
//
// This sheet is the entire pitch. Tapping "Keep Only While Using" on the iOS
// dialog that follows cannot be undone by asking again: the app never gets
// another prompt, only the option of talking somebody into Settings. So the
// sheet leads with what we do not do, because the honest limits are the most
// persuasive thing we have.
//
// Every claim below is literally true of region monitoring. iOS hands the app
// "you entered circle 3" and nothing more. There is no track, no history, and
// nothing leaves the phone. If that ever stops being true, this copy has to
// change first.

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function NearbyRemindersSheet({
  visible,
  vendorName,
  busy = false,
  onEnable,
  onDismiss,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={busy ? () => {} : onDismiss}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={busy ? () => {} : onDismiss}
      >
        <TouchableOpacity
          style={styles.sheet}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.handle} />

          <View style={styles.iconRing}>
            <Ionicons name="location" size={26} color="#DB8633" />
          </View>

          <Text style={styles.title}>Never miss a discount again</Text>
          <Text style={styles.body}>
            {vendorName
              ? `You just saved at ${vendorName}. We can nudge you next time you're there, before you pay.`
              : "We can nudge you when you're at one of our businesses, before you pay."}
          </Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              We check whether you've arrived at a THRIVE business. Nothing
              else.
            </Text>
          </View>
          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              We don't keep a history of where you go.
            </Text>
          </View>
          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              At most one nudge a day, and you can turn it off whenever you
              like.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primary}
            onPress={onEnable}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.primaryText}>Turn on nearby reminders</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondary}
            onPress={onDismiss}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryText}>Not now</Text>
          </TouchableOpacity>

          <Text style={styles.fine}>You can change this later in Settings.</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E1E1E5',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  iconRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFF5EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6d6e72',
    marginBottom: 14,
  },
  point: {
    flexDirection: 'row',
    marginBottom: 9,
  },
  bullet: {
    color: '#DB8633',
    fontWeight: '800',
    marginRight: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  pointText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#324E58',
  },
  // Brand orange ground, so the label on it is white.
  primary: {
    marginTop: 16,
    backgroundColor: '#DB8633',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondary: {
    marginTop: 6,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#324E58',
    fontSize: 14,
    fontWeight: '600',
  },
  fine: {
    marginTop: 8,
    fontSize: 11.5,
    color: '#8E9BAE',
    textAlign: 'center',
  },
});
