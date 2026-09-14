/**
 * Notification centre — the donor's record of what happened.
 *
 * Until this screen existed, a push notification WAS the notification: if the
 * donor had no token registered, had denied notifications, or swiped the
 * banner away, the event was simply gone. Rows come from user_notifications,
 * which is written before the push is attempted, so the feed is right even
 * when delivery wasn't.
 *
 * Lives under menu/ alongside manageCards and donationSummary, which are the
 * two screens notifications most often deep-link into.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import API from '../../lib/api';
import {
  notificationTargetPath,
  notificationStyle,
  relativeTime,
} from '../../utils/notificationRoute';

const PAGE_SIZE = 30;

export default function NotificationCenter() {
  const router = useRouter();

  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { notifications, unreadCount: unread } = await API.getNotifications({
      limit: PAGE_SIZE,
      offset: 0,
    });
    setItems(notifications);
    setUnreadCount(unread);
    setReachedEnd(notifications.length < PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh on return: a push may have arrived while the donor was on another
  // screen, and the feed shouldn't be stale behind the badge that sent them here.
  useFocusEffect(
    useCallback(() => {
      load({ silent: true });
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || reachedEnd || loading) return;
    setLoadingMore(true);
    const { notifications } = await API.getNotifications({
      limit: PAGE_SIZE,
      offset: items.length,
    });
    if (notifications.length === 0) {
      setReachedEnd(true);
    } else {
      // Guard against a duplicate page if a new notification arrived and
      // shifted the offset window while we were paging.
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...notifications.filter((n) => !seen.has(n.id))];
      });
      if (notifications.length < PAGE_SIZE) setReachedEnd(true);
    }
    setLoadingMore(false);
  }, [items.length, loading, loadingMore, reachedEnd]);

  const handleOpen = useCallback(
    async (item) => {
      // Optimistic: the row should stop looking unread the instant it's
      // tapped, not after a round trip we're about to navigate away from.
      if (!item.read_at) {
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        API.markNotificationsRead({ ids: [item.id] });
      }

      const target = notificationTargetPath(item.data);
      if (target) {
        try {
          router.push(target);
        } catch (e) {
          console.warn('Notification row routing failed:', e);
        }
      }
    },
    [router],
  );

  const handleMarkAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    );
    setUnreadCount(0);
    await API.markNotificationsRead({ all: true });
  }, []);

  const renderItem = ({ item }) => {
    const { icon, tint } = notificationStyle(item.type);
    const unread = !item.read_at;
    return (
      <TouchableOpacity
        style={[styles.row, unread && styles.rowUnread]}
        onPress={() => handleOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${tint}1A` }]}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleLine}>
            <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={2}>
              {item.title}
            </Text>
            {unread && <View style={styles.dot} />}
          </View>
          <Text style={styles.rowText} numberOfLines={3}>
            {item.body}
          </Text>
          <Text style={styles.rowTime}>{relativeTime(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Image
            source={require('../../../assets/icons/arrow-left.png')}
            style={{ width: 24, height: 24, tintColor: '#324E58' }}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={() => router.push('/menu/notifications')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
        >
          <Text style={styles.settingsLink}>Settings</Text>
        </TouchableOpacity>
      </View>

      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllRow} onPress={handleMarkAllRead}>
          <Text style={styles.markAllText}>
            Mark all {unreadCount} as read
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color="#DB8633" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DB8633" />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color="#DB8633" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Image
                source={require('../../../assets/icons/notification.png')}
                style={styles.emptyIcon}
                resizeMode="contain"
              />
              <Text style={styles.emptyTitle}>Nothing yet</Text>
              <Text style={styles.emptyText}>
                Donation receipts, new discounts from places you've favorited, and
                anything needing your attention will show up here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 5,
    marginBottom: 12,
  },
  backButton: {
    width: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6d6e72',
    textAlign: 'center',
    flex: 1,
  },
  settingsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DB8633',
    width: 60,
    textAlign: 'right',
  },
  markAllRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DB8633',
  },
  listContent: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
    alignItems: 'flex-start',
  },
  rowUnread: {
    backgroundColor: '#F7FAFB',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: {
    fontSize: 18,
  },
  rowBody: {
    flex: 1,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#324E58',
  },
  rowTitleUnread: {
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DB8633',
    marginLeft: 8,
  },
  rowText: {
    fontSize: 14,
    color: '#6d6e72',
    marginTop: 4,
    lineHeight: 20,
  },
  rowTime: {
    fontSize: 12,
    color: '#9aa7ac',
    marginTop: 6,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flexGrow: 1,
  },
  footer: {
    paddingVertical: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    // The source is 45x52, so keep that ratio rather than squaring it.
    width: 44,
    height: 51,
    marginBottom: 12,
    // Muted to match the empty-state text: at full strength it read as an
    // alert rather than the absence of one.
    tintColor: '#B6C2CE',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#324E58',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6d6e72',
    textAlign: 'center',
    lineHeight: 20,
  },
});
