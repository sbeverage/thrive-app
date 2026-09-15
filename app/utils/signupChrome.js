/**
 * The back button, defined once.
 *
 * These values are not invented: they match the charity detail screen under
 * (tabs), which is the app's existing treatment for a back button floating
 * over artwork or a gradient. Signup had drifted into three different
 * treatments (top 20 / top 18 / not positioned at all, white circle / dark
 * circle, 22px / 24px icon), so a donor saw the button jump as they moved
 * through the flow.
 *
 * top: 12 is deliberately a constant rather than insets.top + n. There is no
 * SafeAreaProvider in this app's tree, so useSafeAreaInsets() can report 0,
 * and an earlier attempt to compensate with Math.max(insets.top, 44) + 6
 * stacked a floor on top of a real inset and pushed the button far too low.
 * 50 clears the status bar on every device the app supports and is what the
 * rest of the app already uses.
 *
 * Spread these into a screen's own StyleSheet so there is one source of truth:
 *   backButton: BACK_BUTTON,
 *   backIcon: BACK_ICON,
 */
export const BACK_BUTTON = {
  position: 'absolute',
  top: 12,
  left: 16,
  zIndex: 100,
  backgroundColor: 'rgba(0,0,0,0.18)',
  borderRadius: 18,
  padding: 6,
};

/** White arrow, because the button above is a dark translucent circle. */
export const BACK_ICON = {
  width: 22,
  height: 22,
  tintColor: '#fff',
};
