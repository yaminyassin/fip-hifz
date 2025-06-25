import React, { createContext, useContext, useState, useEffect } from 'react';

interface EventContextType {
  currentEvent: string | null;
  setCurrentEvent: (event: string) => void;
  isEventLoaded: boolean;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const useEvent = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
};

interface EventProviderProps {
  children: React.ReactNode;
}

export const EventProvider: React.FC<EventProviderProps> = ({ children }) => {
  const [currentEvent, setCurrentEvent] = useState<string | null>(null);
  const [isEventLoaded, setIsEventLoaded] = useState(false);

  useEffect(() => {
    // Get event from URL query parameter (e.g., /admin?event=lisbon-2025)
    const urlParams = new URLSearchParams(window.location.search);
    const eventFromUrl = urlParams.get('event');
    
    if (eventFromUrl) {
      setCurrentEvent(eventFromUrl);
    } else {
      // Only default to lisbon-2025 if on a non-root page
      if (window.location.pathname !== '/') {
        setCurrentEvent('lisbon-2025');
      }
    }
    setIsEventLoaded(true);
    
    // Listen for URL changes
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const eventFromUrl = urlParams.get('event');
      if (eventFromUrl) {
        setCurrentEvent(eventFromUrl);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSetCurrentEvent = (event: string) => {
    setCurrentEvent(event);
    // Update URL query parameter when event changes
    const url = new URL(window.location.href);
    url.searchParams.set('event', event);
    window.history.pushState({}, '', url.toString());
  };

  return (
    <EventContext.Provider 
      value={{ 
        currentEvent, 
        setCurrentEvent: handleSetCurrentEvent,
        isEventLoaded 
      }}
    >
      {children}
    </EventContext.Provider>
  );
}; 