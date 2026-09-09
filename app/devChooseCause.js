/**
 * Development-only preview of the cause picker.
 *
 * Lives outside app/signupFlow/ on purpose. That folder's layout redirects
 * anyone without a session straight back to the welcome screen, which is the
 * guard described in CLAUDE.md and is not something to weaken for
 * convenience. Rendering the same component from an unguarded route means the
 * picker can be reviewed without signing in and without touching the guard.
 *
 * What that costs: onward navigation from here still goes to signupFlow
 * screens, which are guarded, so "choose this cause" will bounce to the
 * welcome screen. Fine for reviewing the picker itself, which is the point.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ChooseCause from './signupFlow/chooseCause';

export default function DevChooseCause() {
  if (!__DEV__) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedText}>Not available.</Text>
      </View>
    );
  }
  return <ChooseCause preview />;
}

const styles = StyleSheet.create({
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  blockedText: { color: '#8a9ba1', fontSize: 15 },
});
