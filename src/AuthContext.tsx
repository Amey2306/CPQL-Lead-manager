import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'sm' | 'partner' | 'vendor' | 'vendor_manager' | 'vendor_editor' | 'vendor_viewer';
  displayName: string;
  vendorCompanyId?: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSM: boolean;
  isPartner: boolean;
  isVendor: boolean;
  isVendorManager: boolean;
  isVendorEditor: boolean;
  isVendorViewer: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSM: false,
  isPartner: false,
  isVendor: false,
  isVendorManager: false,
  isVendorEditor: false,
  isVendorViewer: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          // Default role for first user or fallback
          const isDefaultAdmin = firebaseUser.email === 'ameyshinde2391@gmail.com';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: isDefaultAdmin ? 'admin' : 'partner',
            displayName: firebaseUser.displayName || 'User',
          };
          
          await setDoc(userDocRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
          });
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isSM: profile?.role === 'sm',
    isPartner: profile?.role === 'partner',
    isVendor: ['vendor', 'vendor_manager', 'vendor_editor', 'vendor_viewer'].includes(profile?.role || ''),
    isVendorManager: profile?.role === 'vendor' || profile?.role === 'vendor_manager',
    isVendorEditor: profile?.role === 'vendor_editor',
    isVendorViewer: profile?.role === 'vendor_viewer',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
