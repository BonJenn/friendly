import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Common/Button';
import { Card } from '@/components/Common/Card';
import { colors, spacing, radii, typography } from '@/config/theme';
import {
  PERSONA_LABELS,
  PERSONA_DESCRIPTIONS,
  VOICE_LABELS,
} from '@/config/constants';
import { completeOnboarding } from '@/services/api';
import { lightTap, successTap } from '@/utils/haptics';
import type { Persona, VoiceStyle } from '@/types';

type Step = 'nickname' | 'persona' | 'voice' | 'schedule';

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>('nickname');
  const [nickname, setNickname] = useState('');
  const [persona, setPersona] = useState<Persona>('cool');
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('neutral');
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(22);
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    setLoading(true);
    try {
      const result = await completeOnboarding({
        userNickname: nickname.trim(),
        persona,
        voiceStyle,
        callWindow: { startHour, endHour },
      });
      successTap();
      Alert.alert(
        'Meet your friend!',
        `They chose the name "${result.friendNickname}" for themselves. Let's go!`
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    lightTap();
    const steps: Step[] = ['nickname', 'persona', 'voice', 'schedule'];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1]);
    }
  };

  const prevStep = () => {
    lightTap();
    const steps: Step[] = ['nickname', 'persona', 'voice', 'schedule'];
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setStep(steps[idx - 1]);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.stepLabel}>
          {step === 'nickname' && 'What should your friend call you?'}
          {step === 'persona' && 'Pick your friend\'s vibe'}
          {step === 'voice' && 'Choose a voice'}
          {step === 'schedule' && 'When can your friend call?'}
        </Text>

        {step === 'nickname' && (
          <View style={styles.section}>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Your nickname"
              placeholderTextColor={colors.textMuted}
              maxLength={20}
              autoFocus
            />
            <Button
              title="Next"
              onPress={nextStep}
              disabled={nickname.trim().length < 1}
              size="lg"
            />
          </View>
        )}

        {step === 'persona' && (
          <View style={styles.section}>
            {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => {
                  lightTap();
                  setPersona(p);
                }}
              >
                <Card
                  style={[
                    styles.optionCard,
                    persona === p && styles.optionCardSelected,
                  ]}
                >
                  <Text style={styles.optionTitle}>{PERSONA_LABELS[p]}</Text>
                  <Text style={styles.optionDesc}>
                    {PERSONA_DESCRIPTIONS[p]}
                  </Text>
                </Card>
              </TouchableOpacity>
            ))}
            <View style={styles.navRow}>
              <Button title="Back" onPress={prevStep} variant="ghost" />
              <Button title="Next" onPress={nextStep} />
            </View>
          </View>
        )}

        {step === 'voice' && (
          <View style={styles.section}>
            {(Object.keys(VOICE_LABELS) as VoiceStyle[]).map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => {
                  lightTap();
                  setVoiceStyle(v);
                }}
              >
                <Card
                  style={[
                    styles.optionCard,
                    voiceStyle === v && styles.optionCardSelected,
                  ]}
                >
                  <Text style={styles.optionTitle}>{VOICE_LABELS[v]}</Text>
                </Card>
              </TouchableOpacity>
            ))}
            <View style={styles.navRow}>
              <Button title="Back" onPress={prevStep} variant="ghost" />
              <Button title="Next" onPress={nextStep} />
            </View>
          </View>
        )}

        {step === 'schedule' && (
          <View style={styles.section}>
            <Card>
              <Text style={styles.scheduleLabel}>Available hours</Text>
              <View style={styles.scheduleRow}>
                <View style={styles.scheduleInput}>
                  <Text style={styles.scheduleSubLabel}>From</Text>
                  <View style={styles.hourPicker}>
                    <TouchableOpacity
                      onPress={() => setStartHour(Math.max(0, startHour - 1))}
                    >
                      <Text style={styles.hourButton}>{'−'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.hourValue}>
                      {startHour.toString().padStart(2, '0')}:00
                    </Text>
                    <TouchableOpacity
                      onPress={() => setStartHour(Math.min(23, startHour + 1))}
                    >
                      <Text style={styles.hourButton}>{'+'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.scheduleInput}>
                  <Text style={styles.scheduleSubLabel}>To</Text>
                  <View style={styles.hourPicker}>
                    <TouchableOpacity
                      onPress={() => setEndHour(Math.max(0, endHour - 1))}
                    >
                      <Text style={styles.hourButton}>{'−'}</Text>
                    </TouchableOpacity>
                    <Text style={styles.hourValue}>
                      {endHour.toString().padStart(2, '0')}:00
                    </Text>
                    <TouchableOpacity
                      onPress={() => setEndHour(Math.min(23, endHour + 1))}
                    >
                      <Text style={styles.hourButton}>{'+'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Card>
            <View style={styles.navRow}>
              <Button title="Back" onPress={prevStep} variant="ghost" />
              <Button
                title="Let's Go!"
                onPress={handleComplete}
                size="lg"
                loading={loading}
              />
            </View>
          </View>
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
    paddingTop: spacing.xxl,
  },
  stepLabel: {
    ...typography.h2,
    marginBottom: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionCard: {
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.bgElevated,
  },
  optionTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  optionDesc: {
    ...typography.bodySmall,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  scheduleLabel: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  scheduleInput: {
    flex: 1,
  },
  scheduleSubLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  hourPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  hourButton: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  hourValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
