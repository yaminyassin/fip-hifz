import React, { useState, useEffect } from 'react';
import { Button } from '@/components/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Card } from '@/components/shadcn/card';
import { CreateEventWizard } from '@/components/config-editor/CreateEventWizard';
import { Plus, Calendar, Users } from 'lucide-react';
import { collection, getDocs, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { firestore } from '@/main';

interface EventInfo {
  id: string;
  name: string;
  createdAt?: Timestamp;
  participantCount?: number;
  description?: string;
}

interface EventSelectorProps {
  showAddEvent?: boolean;
}

export const EventSelector: React.FC<EventSelectorProps> = ({ showAddEvent = false }) => {
  const [availableEvents, setAvailableEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadAvailableEvents();
  }, []);

  const ensureEventDocumentExists = async (eventId: string) => {
    try {
      const eventDocRef = doc(firestore, 'events', eventId);
      const eventDoc = await getDoc(eventDocRef);
      
      if (!eventDoc.exists()) {
        // Check if event has participants (indicating it exists but missing the document)
        const participantsRef = collection(firestore, 'events', eventId, 'participants');
        const participantsSnapshot = await getDocs(participantsRef);
        
        if (participantsSnapshot.size > 0) {
          // Create the event document
          await setDoc(eventDocRef, {
            name: eventId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            createdAt: new Date(),
            status: 'active',
            description: `Competition event with ${participantsSnapshot.size} participants`
          });
          console.log(`Created missing event document for ${eventId}`);
        }
      }
    } catch (error) {
      console.error(`Error ensuring event document exists for ${eventId}:`, error);
    }
  };

  const loadAvailableEvents = async () => {
    try {
      setLoading(true);
      
      // First, ensure the demo-2026 event document exists
      await ensureEventDocumentExists('demo-2026');
      
      const eventsRef = collection(firestore, 'events');
      const eventsSnapshot = await getDocs(eventsRef);
      
      console.log('Found event documents:', eventsSnapshot.docs.map(doc => doc.id));
      
      const events: EventInfo[] = [];
      
      for (const eventDoc of eventsSnapshot.docs) {
        const eventId = eventDoc.id;
        
        // Get participant count for this event
        try {
          const participantsRef = collection(firestore, 'events', eventId, 'participants');
          const participantsSnapshot = await getDocs(participantsRef);
          const participantCount = participantsSnapshot.size;
          
          events.push({
            id: eventId,
            name: eventId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            participantCount,
            description: `Event with ${participantCount} participants`
          });
        } catch (error) {
          console.error(`Error loading data for event ${eventId}:`, error);
          events.push({
            id: eventId,
            name: eventId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            participantCount: 0,
            description: 'Event data'
          });
        }
      }
      
      // Sort events by name
      events.sort((a, b) => a.name.localeCompare(b.name));
      setAvailableEvents(events);
      console.log('Final events list:', events);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventChange = (eventId: string) => {
    console.log('Event selected:', eventId);
    // Redirect to event-specific login instead of directly switching
    try {
      window.location.href = `/login?event=${eventId}`;
    } catch (error) {
      console.error('Error redirecting to login:', error);
      // Fallback method
      window.location.assign(`/login?event=${eventId}`);
    }
  };

  /**
   * Creating an event is now the config wizard's job, not this component's.
   *
   * The previous implementation here wrote only events/{id} and its
   * auth_settings — no evaluation descriptor — which produced an event that
   * failed closed forever with no way to repair it from inside the app.
   * There is deliberately no "create now, configure later" path.
   */

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-center">
          <p className="text-gray-600">Loading events...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Event Selection</h2>
            <p className="text-sm text-gray-600">
              Choose the competition event to manage
            </p>
          </div>
          {showAddEvent && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          )}
        </div>

        {showCreateForm && showAddEvent && (
          <div className="border rounded-lg p-4">
            <CreateEventWizard
              onCreated={(eventId) => {
                setShowCreateForm(false);
                window.location.href = `/login?event=${eventId}`;
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-medium">Available Events:</label>
          <Select onValueChange={handleEventChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select an event to access..." />
            </SelectTrigger>
            <SelectContent>
              {availableEvents.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{event.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 ml-4">
                      <Users className="h-3 w-3" />
                      {event.participantCount}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="pt-3 border-t">
          <p className="text-sm text-gray-600">
            💡 Select an event above to access its secure portal
          </p>
        </div>
      </div>
    </Card>
  );
}; 