import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { db } from '@/services/firebase';
import { useAuth } from './AuthContext';
import type { UserProfile, DailyUsage } from '@/types';

interface UserContextValue {
  profile: UserProfile | null;
  usage: DailyUsage | null;
  loading: boolean;
  refreshProfile: () => void;
}

const UserContext = createContext<UserContextValue>({
  profile: null,
  usage: null,
  loading: true,
  refreshProfile: () => {},
});

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<DailyUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen to user profile
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setUsage(null);
      setLoading(false);
      return;
    }

    const unsubProfile = db
      .collection('users')
      .doc(user.uid)
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            setProfile({ uid: user.uid, ...doc.data() } as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error('Profile listener error:', err);
          setLoading(false);
        }
      );

    const unsubUsage = db
      .collection('usage')
      .doc(user.uid)
      .collection('days')
      .doc(todayKey())
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            setUsage(doc.data() as DailyUsage);
          } else {
            setUsage({
              messagesUsed: 0,
              voiceSecondsUsed: 0,
              imagesUsed: 0,
              callsPlaced: 0,
              callsReceived: 0,
              date: todayKey(),
            });
          }
        },
        (err) => {
          console.error('Usage listener error:', err);
        }
      );

    return () => {
      unsubProfile();
      unsubUsage();
    };
  }, [user, refreshKey]);

  const refreshProfile = () => setRefreshKey((k) => k + 1);

  return (
    <UserContext.Provider value={{ profile, usage, loading, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
