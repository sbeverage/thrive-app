// Search 501(c)(3) registry (via our ProPublica proxy) and let a donor pick
// an org that isn't on THRIVE yet. Selection creates a "pending verification"
// charity row that the admin team can later approve. Used inside the signup
// flow so a donor can pick their cause even if we haven't onboarded it.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, AntDesign } from '@expo/vector-icons';
import API from '../app/lib/api';

const PENDING_PLACEHOLDER = require('../assets/images/pending-charity.png');

export default function SuggestCharityModal({
  visible,
  initialQuery = '',
  onClose,
  onSuggested,
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const lastQueryRef = useRef('');

  // Reset state every time the modal opens so a stale search doesn't linger.
  useEffect(() => {
    if (!visible) return;
    setQuery(initialQuery || '');
    setError(null);
    setResults([]);
    setLoading(false);
    setSubmitting(false);
  }, [visible, initialQuery]);

  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      setError(null);
      try {
        const list = await API.searchCharities(q);
        // Drop the response if a newer query has already kicked off.
        if (lastQueryRef.current !== q) return;
        setResults(Array.isArray(list) ? list : []);
      } catch (e) {
        if (lastQueryRef.current === q) {
          setError(e?.message || 'Search failed. Try again.');
        }
      } finally {
        if (lastQueryRef.current === q) setLoading(false);
      }
    }, 320);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, visible]);

  const handlePick = async (item) => {
    if (submitting) return;
    // Already on THRIVE? Just hand the existing record back to the parent so
    // it can select it like any other charity.
    if (item.existingCharityId) {
      try {
        setSubmitting(true);
        const existing = await API.getCharityById(item.existingCharityId);
        if (existing) onSuggested?.(existing);
        onClose?.();
      } catch (e) {
        Alert.alert('Could not select', e?.message || 'Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    Alert.alert(
      `Suggest ${item.name}?`,
      `We'll verify this 501(c)(3) within 5 business days. Until they're approved:\n\n• Your monthly donations are held safely\n• You'll be notified the moment they're live\n• If we can't verify them, we'll email you so you can pick a different cause`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suggest charity',
          style: 'default',
          onPress: async () => {
            try {
              setSubmitting(true);
              const created = await API.suggestCharity({
                ein: item.ein,
                name: item.name,
                city: item.city,
                state: item.state,
                ntee_code: item.ntee_code,
              });
              onSuggested?.(created);
              onClose?.();
            } catch (e) {
              Alert.alert('Could not save', e?.message || 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }) => {
    const existing = !!item.existingCharityId;
    const location = [item.city, item.state].filter(Boolean).join(', ');
    return (
      <TouchableOpacity
        style={styles.resultCard}
        onPress={() => handlePick(item)}
        activeOpacity={0.85}
        disabled={submitting}
      >
        <View style={styles.resultLogoWrap}>
          <Image source={PENDING_PLACEHOLDER} style={styles.resultLogo} />
        </View>
        <View style={styles.resultText}>
          <Text style={styles.resultName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.resultMetaRow}>
            {item.suggestedCategory ? (
              <>
                <Text style={styles.resultCategory}>{item.suggestedCategory}</Text>
                <View style={styles.metaDot} />
              </>
            ) : null}
            {location ? (
              <Text style={styles.resultLocation}>{location}</Text>
            ) : null}
          </View>
          <Text style={styles.resultEin}>EIN {item.ein}</Text>
        </View>
        <View style={styles.resultAction}>
          {existing ? (
            <View style={styles.badgeLive}>
              <Text style={styles.badgeLiveText}>On THRIVE</Text>
            </View>
          ) : (
            <View style={styles.badgePending}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.badgePendingText}>Suggest</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const emptyMessage = useMemo(() => {
    if (loading) return null;
    if (query.trim().length < 2)
      return 'Type a charity name to search the IRS 501(c)(3) registry.';
    if (results.length === 0)
      return "No matches. Try a different spelling or include the city.";
    return null;
  }, [loading, query, results.length]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <LinearGradient
          colors={['#2C3E50', '#4CA1AF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <AntDesign name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Find your charity</Text>
          <Text style={styles.subtitle}>
            Search the IRS 501(c)(3) registry. We'll verify before going live.
          </Text>
        </LinearGradient>

        <View style={styles.searchRow}>
          <Feather name="search" size={18} color="#6d6e72" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by charity name"
            placeholderTextColor="#6d6e72"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AntDesign name="closecircle" size={16} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color="#B91C1C" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#DB8633" />
              <Text style={styles.loadingText}>Searching the registry…</Text>
            </View>
          ) : emptyMessage ? (
            <View style={styles.emptyState}>
              <Image source={PENDING_PLACEHOLDER} style={styles.emptyIllustration} />
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.ein}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </KeyboardAvoidingView>

        {submitting && (
          <View style={styles.submittingOverlay} pointerEvents="auto">
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.submittingText}>Saving your suggestion…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    paddingTop: 44,
    paddingBottom: 22,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 18,
    padding: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginTop: 4,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 18,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e1e5',
    paddingHorizontal: 15,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#324E58',
    paddingVertical: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '500' },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#6B7280', fontSize: 14 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIllustration: {
    width: 140,
    height: 100,
    resizeMode: 'contain',
    opacity: 0.85,
    marginBottom: 16,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resultLogoWrap: { marginRight: 12 },
  resultLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF5EB',
    resizeMode: 'cover',
  },
  resultText: { flex: 1, minWidth: 0 },
  resultName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C4F7D',
    marginBottom: 2,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  resultCategory: {
    fontSize: 12,
    color: '#8E9BAE',
    fontWeight: '600',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 6,
  },
  resultLocation: { fontSize: 12, color: '#8E9BAE' },
  resultEin: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resultAction: { marginLeft: 10 },
  badgeLive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeLiveText: { color: '#15803D', fontSize: 11, fontWeight: '700' },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DB8633',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgePendingText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  submittingText: { color: '#fff', fontSize: 14, fontWeight: '500' },
});
