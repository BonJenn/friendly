import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageBubble } from '@/components/Chat/MessageBubble';
import { ChatInput } from '@/components/Chat/ChatInput';
import { colors, spacing, typography } from '@/config/theme';
import { useUser } from '@/context/UserContext';
import { sendMessage, startChatSession } from '@/services/api';
import { playAudio } from '@/services/audio';
import { TIER_LIMITS } from '@/types';
import type { ChatMessage, AIResponse } from '@/types';
import { db } from '@/services/firebase';

export function ChatScreen() {
  const { profile, usage } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  const tier = profile?.tier ?? 'free';
  const limits = TIER_LIMITS[tier];
  const messagesUsed = usage?.messagesUsed ?? 0;
  const atCap = messagesUsed >= limits.messagesPerDay;

  // Initialize or resume session
  useEffect(() => {
    if (!profile) return;

    // Listen for existing messages from most recent active session
    const unsub = db
      .collection('sessions')
      .where('uid', '==', profile.uid)
      .where('type', '==', 'chat')
      .where('status', '==', 'active')
      .orderBy('startedAt', 'desc')
      .limit(1)
      .onSnapshot(
        async (snap) => {
          if (snap.empty) {
            // No active session, create one
            try {
              const { sessionId: sid } = await startChatSession();
              setSessionId(sid);
            } catch (err) {
              console.error('Failed to start chat session:', err);
            }
            setInitializing(false);
            return;
          }

          const session = snap.docs[0];
          setSessionId(session.id);

          // Load turns
          try {
            const turnsSnap = await db
              .collection('sessions')
              .doc(session.id)
              .collection('turns')
              .orderBy('createdAt', 'asc')
              .limit(50)
              .get();

            const msgs: ChatMessage[] = turnsSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            })) as ChatMessage[];

            setMessages(msgs);
          } catch (err) {
            console.error('Failed to load turns:', err);
          }
          setInitializing(false);
        },
        (error) => {
          // Firestore listener error — fall back to creating session via API
          console.error('Session listener error:', error);
          (async () => {
            try {
              const { sessionId: sid } = await startChatSession();
              setSessionId(sid);
            } catch (err) {
              console.error('Failed to start chat session:', err);
            }
            setInitializing(false);
          })();
        }
      );

    return unsub;
  }, [profile]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const handleSend = async (text: string) => {
    if (!sessionId || atCap) return;

    // Optimistic user message
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      sessionId,
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();
    setSending(true);

    try {
      const response: AIResponse = await sendMessage(sessionId, text);

      const friendMsg: ChatMessage = {
        id: `friend-${Date.now()}`,
        sessionId,
        role: 'friend',
        text: response.text,
        emotion: response.emotion,
        audioUrl: response.audioUrl ?? undefined,
        imageUrl: response.imageUrl ?? undefined,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, friendMsg]);
      scrollToBottom();

      if (response.shouldEndSession) {
        // Start new session on next message
        setSessionId(null);
      }
    } catch (err: any) {
      console.error('Send failed:', err);
      // Show error as friend message
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        sessionId,
        role: 'friend',
        text: 'Hmm, something went wrong on my end. Try again?',
        emotion: 'caring',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const handlePlayAudio = async (url: string) => {
    try {
      await playAudio(url);
    } catch (err) {
      console.error('Audio playback failed:', err);
    }
  };

  if (!profile) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{profile.friendNickname}</Text>
          <Text style={styles.headerSub}>
            {messagesUsed}/{limits.messagesPerDay} messages today
          </Text>
        </View>

        {initializing ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onPlayAudio={handlePlayAudio}
              />
            )}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={scrollToBottom}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  Say hey to {profile.friendNickname}!
                </Text>
              </View>
            }
          />
        )}

        {atCap ? (
          <View style={styles.capMessage}>
            <Text style={styles.capText}>
              {profile.friendNickname} needs a break — catch up tomorrow!
            </Text>
          </View>
        ) : (
          <ChatInput
            onSend={handleSend}
            loading={sending}
            disabled={!sessionId || initializing}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
  },
  headerSub: {
    ...typography.caption,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingVertical: spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  capMessage: {
    padding: spacing.lg,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  capText: {
    ...typography.bodySmall,
    color: colors.warning,
    textAlign: 'center',
  },
});
