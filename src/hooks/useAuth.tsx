import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/main';

interface AuthContextType {
    isAuthenticated: boolean;
    login: (password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
        // Check session storage on initial load for persistence
        return sessionStorage.getItem('isAuthenticated') === 'true';
    });

    useEffect(() => {
        // Keep session storage in sync with the state
        sessionStorage.setItem('isAuthenticated', isAuthenticated.toString());
    }, [isAuthenticated]);

    const login = async (password: string) => {
        try {
            // 1. Define the path to the configuration document in Firestore.
            const configRef = doc(firestore, 'app_config', 'auth_settings');

            // 2. Fetch the document from Firestore.
            const docSnap = await getDoc(configRef);

            if (docSnap.exists()) {
                const storedPassword = docSnap.data().eventPassword;

                // 3. Compare the submitted password with the one from Firestore.
                if (password === storedPassword) {
                    setIsAuthenticated(true);
                } else {
                    throw new Error('Invalid password');
                }
            } else {
                console.error("Authentication configuration document not found in Firestore.");
                throw new Error('Authentication system not configured.');
            }
        } catch (error) {
            console.error('Login error:', error);
            // Re-throw the error to be caught by the Login component.
            throw new Error('Invalid password');
        }
    };

    const logout = () => {
        setIsAuthenticated(false);
        sessionStorage.removeItem('isAuthenticated');
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
} 