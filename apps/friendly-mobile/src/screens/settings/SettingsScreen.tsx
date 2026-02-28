import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '@/components/Common/Card';
import { Button } from '@/components/Common/Button';
import { colors, spacing, radii, typography } from '@/config/theme';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/context/AuthContext';
import { signOut } from '@/services/auth';
import { updateProfile } from '@/services/api';
import { restorePurchases, getTierFromEntitlements } from '@/services/purchases';
import { PERSONA_LABELS, VOICE_LABELS } from '@/config/constants';
import { lightTap } from '@/utils/haptics';
import type { Persona, VoiceStyle } from '@/types';

export function SettingsScreen() {
  const { profile } = useUser();
  const [restoring, setRestoring] = useState(false);

  if (!profile) return null;

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handlePersonaChange = async (persona: Persona) => {
    lightTap();
    try {
      await updateProfile({ persona });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleVoiceChange = async (voiceStyle: VoiceStyle) => {
    lightTap();
    try {
      await updateProfile({ voiceStyle });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      const tier = getTierFromEntitlements(info);
      Alert.alert('Restored', `Your tier: ${tier}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Profile</Text>
          <Row label="Your name" value={profile.userNickname} />
          <Row label="Friend's name" value={profile.friendNickname} />
          <Row label="Tier" value={profile.tier.toUpperCase()} />
        </Card>

        {/* Persona */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Friend Persona</Text>
          <View style={styles.chipRow}>
            {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.chip,
                  profile.persona === p && styles.chipActive,
                ]}
                onPress={() => handlePersonaChange(p)}
              >
                <Text
                  style={[
                    styles.chipText,
                    profile.persona === p && styles.chipTextActive,
                  ]}
                >
                  {PERSONA_LABELS[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Voice */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Voice Style</Text>
          <View style={styles.chipRow}>
            {(Object.keys(VOICE_LABELS) as VoiceStyle[]).map((v) => (
              <TouchableOpacity
                key={v}
                style={[
                  styles.chip,
                  profile.voiceStyle === v && styles.chipActive,
                ]}
                onPress={() => handleVoiceChange(v)}
              >
                <Text
                  style={[
                    styles.chipText,
                    profile.voiceStyle === v && styles.chipTextActive,
                  ]}
                >
                  {VOICE_LABELS[v]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Call Window */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Call Window</Text>
          <Text style={styles.cardBody}>
            {profile.callWindow.startHour.toString().padStart(2, '0')}:00 –{' '}
            {profile.callWindow.endHour.toString().padStart(2, '0')}:00 local
            time
          </Text>
        </Card>

        {/* Subscription */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>
          <Button
            title="Restore Purchases"
            onPress={handleRestore}
            variant="secondary"
            loading={restoring}
          />
        </Card>

        {/* Disclaimer */}
        <Card style={[styles.card, styles.disclaimerCard]}>
          <Text style={styles.disclaimerTitle}>Important Notice</Text>
          <Text style={styles.disclaimerText}>
            Friendly is an AI companion for entertainment and casual
            conversation. It is not a substitute for professional mental health
            support, therapy, or counseling.{'\n\n'}If you are in crisis, please
            contact:{'\n'}
            {'  '}988 Suicide & Crisis Lifeline: Call or text 988{'\n'}
            {'  '}Crisis Text Line: Text HOME to 741741
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://988lifeline.org')}
          >
            <Text style={styles.link}>Learn more about crisis resources</Text>
          </TouchableOpacity>
        </Card>

        {/* Sign out */}
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="ghost"
          style={styles.signOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: {
    ...typography.bodySmall,
  },
  value: {
    ...typography.body,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  cardBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  disclaimerCard: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.warning,
  },
  disclaimerTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  disclaimerText: {
    ...typography.bodySmall,
    lineHeight: 22,
  },
  link: {
    ...typography.bodySmall,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  signOut: {
    marginTop: spacing.lg,
  },
});
