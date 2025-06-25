import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '@/main';

interface AuthContextType {
    isAuthenticated: boolean;
    currentEvent: string | null;
    login: (eventId: string, password: string) => Promise<void>;
    logout: () => void;
    isEventAuthenticated: (eventId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [authenticatedEvents, setAuthenticatedEvents] = useState<Set<string>>(() => {
        // Load authenticated events from session storage
        const stored = sessionStorage.getItem('authenticatedEvents');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    });
    
    const [currentEvent, setCurrentEvent] = useState<string | null>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('event');
    });

    useEffect(() => {
        // Keep session storage in sync with authenticated events
        sessionStorage.setItem('authenticatedEvents', JSON.stringify([...authenticatedEvents]));
    }, [authenticatedEvents]);

    useEffect(() => {
        // Update current event when URL changes
        const urlParams = new URLSearchParams(window.location.search);
        const eventFromUrl = urlParams.get('event');
        setCurrentEvent(eventFromUrl);
    }, []);

    const isAuthenticated = currentEvent ? authenticatedEvents.has(currentEvent) : false;

    const login = async (eventId: string, password: string) => {
        try {
            // Try to get event-specific password from Firestore
            const configRef = doc(firestore, 'events', eventId, 'app_config', 'auth_settings');
            let docSnap = await getDoc(configRef);
            
            if (!docSnap.exists()) {
                // Create default auth settings for new events
                const defaultPassword = `${eventId}-admin`; // e.g., "lisbon-2025-admin"
                await setDoc(configRef, {
                    eventPassword: defaultPassword,
                    createdAt: new Date(),
                });
                
                // If they used the default password, authenticate them
                if (password === defaultPassword) {
                    setAuthenticatedEvents(prev => new Set([...prev, eventId]));
                    setCurrentEvent(eventId);
                    return;
                } else {
                    throw new Error('Wrong password');
                }
            }
            
            const storedPassword = docSnap.data().eventPassword;
            if (password === storedPassword) {
                setAuthenticatedEvents(prev => new Set([...prev, eventId]));
                setCurrentEvent(eventId);
            } else {
                throw new Error('Wrong password');
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    };

    const logout = () => {
        if (currentEvent) {
            setAuthenticatedEvents(prev => {
                const newSet = new Set(prev);
                newSet.delete(currentEvent);
                return newSet;
            });
        }
        setCurrentEvent(null);
    };

    const isEventAuthenticated = (eventId: string) => {
        return authenticatedEvents.has(eventId);
    };

    return (
        <AuthContext.Provider value={{ 
            isAuthenticated, 
            currentEvent, 
            login, 
            logout, 
            isEventAuthenticated 
        }}>
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