import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '@/components/Common/Button';
import { Card } from '@/components/Common/Card';
import { StreakIndicator } from '@/components/Streak/StreakIndicator';
import { AvatarPlaceholder } from '@/components/Avatar/RiveAvatar';
import { colors, spacing, typography, shadows } from '@/config/theme';
import { useUser } from '@/context/UserContext';
import { TIER_LIMITS } from '@/types';
import type { RootStackParamList, FriendStatus } from '@/types';
import { mediumTap } from '@/utils/haptics';
import { db } from '@/services/firebase';
import { formatTimestamp } from '@/utils/time';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile, usage } = useUser();
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('online');
  const [recentMessages, setRecentMessages] = useState<
    { text: string; createdAt: number; role: string }[]
  >([]);

  // Simulate friend status (in production, this could be based on call window)
  useEffect(() => {
    if (!profile) return;
    const now = new Date();
    const hour = now.getHours();
    const inWindow =
      hour >= profile.callWindow.startHour &&
      hour < profile.callWindow.endHour;
    setFriendStatus(inWindow ? 'online' : 'away');
  }, [profile]);

  // Fetch recent messages
  useEffect(() => {
    if (!profile) return;
    const unsub = db
      .collectionGroup('turns')
      .where('uid', '==', profile.uid)
      .orderBy('createdAt', 'desc')
      .limit(3)
      .onSnapshot(
        (snap) => {
          const msgs = snap.docs.map((d) => d.data() as any);
          setRecentMessages(msgs);
        },
        () => {
          // Collection may not exist yet
        }
      );
    return unsub;
  }, [profile]);

  if (!profile) return null;

  const tier = profile.tier;
  const limits = TIER_LIMITS[tier];
  const messagesLeft = limits.messagesPerDay - (usage?.messagesUsed ?? 0);

  const handleCall = () => {
    mediumTap();
    navigation.navigate('Call', {});
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hey, {profile.userNickname}
            </Text>
            <Text style={styles.subGreeting}>
              {profile.friendNickname} is{' '}
              {friendStatus === 'online' ? 'around' : 'away right now'}
            </Text>
          </View>
          <StreakIndicator days={profile.streakDays} />
        </View>

        {/* Avatar + Call */}
        <View style={styles.avatarSection}>
          <AvatarPlaceholder
            isSpeaking={false}
            emotion="calm"
            size={200}
          />
          <View style={styles.statusDot}>
            <View
              style={[
                styles.dot,
                friendStatus === 'online'
                  ? styles.dotOnline
                  : styles.dotAway,
              ]}
            />
            <Text style={styles.statusText}>
              {friendStatus === 'online' ? 'Online' : 'Away'}
            </Text>
          </View>
        </View>

        <Button
          title={`Call ${profile.friendNickname}`}
          onPress={handleCall}
          size="lg"
          disabled={friendStatus === 'away'}
          style={styles.callButton}
        />

        {/* Usage summary */}
        <Card style={styles.usageCard}>
          <Text style={styles.usageTitle}>Today</Text>
          <View style={styles.usageRow}>
            <View style={styles.usageStat}>
              <Text style={styles.usageValue}>
                {usage?.messagesUsed ?? 0}
              </Text>
              <Text style={styles.usageLabel}>
                / {limits.messagesPerDay} msgs
              </Text>
            </View>
            <View style={styles.usageStat}>
              <Text style={styles.usageValue}>
                {Math.floor((usage?.voiceSecondsUsed ?? 0) / 60)}
              </Text>
              <Text style={styles.usageLabel}>
                / {Math.floor(limits.voiceSecondsPerDay / 60)} min voice
              </Text>
            </View>
          </View>
          {messagesLeft <= 5 && messagesLeft > 0 && (
            <Text style={styles.usageWarning}>
              {messagesLeft} messages left today
            </Text>
          )}
        </Card>

        {/* Recent messages */}
        {recentMessages.length > 0 && (
          <Card style={styles.recentCard}>
            <Text style={styles.recentTitle}>Recent</Text>
            {recentMessages.map((msg, i) => (
              <View key={i} style={styles.recentMsg}>
                <Text style={styles.recentRole}>
                  {msg.role === 'user'
                    ? profile.userNickname
                    : profile.friendNickname}
                </Text>
                <Text style={styles.recentText} numberOfLines={1}>
                  {msg.text}
                </Text>
                <Text style={styles.recentTime}>
                  {formatTimestamp(msg.createdAt)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Tier info */}
        {tier === 'free' && (
          <TouchableOpacity style={styles.upgradeCard} activeOpacity={0.8}>
            <Text style={styles.upgradeTitle}>
              Unlock more time with {profile.friendNickname}
            </Text>
            <Text style={styles.upgradeDesc}>
              Get voice calls, proactive check-ins, and deeper conversations
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  greeting: {
    ...typography.h1,
  },
  subGreeting: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: colors.online,
  },
  dotAway: {
    backgroundColor: colors.away,
  },
  statusText: {
    ...typography.bodySmall,
  },
  callButton: {
    marginBottom: spacing.lg,
  },
  usageCard: {
    marginBottom: spacing.md,
  },
  usageTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  usageRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  usageStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  usageValue: {
    ...typography.h2,
    color: colors.primary,
  },
  usageLabel: {
    ...typography.caption,
  },
  usageWarning: {
    ...typography.bodySmall,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  recentCard: {
    marginBottom: spacing.md,
  },
  recentTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  recentMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recentRole: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primaryLight,
    width: 70,
  },
  recentText: {
    ...typography.bodySmall,
    flex: 1,
  },
  recentTime: {
    ...typography.caption,
  },
  upgradeCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 16,
    padding: spacing.lg,
    ...shadows.card,
  },
  upgradeTitle: {
    ...typography.h3,
    color: colors.white,
    marginBottom: spacing.sm,
  },
  upgradeDesc: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.7)',
  },
});
