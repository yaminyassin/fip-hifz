import React, { useState, useEffect } from 'react';
import { Button } from '@/components/shadcn/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Card } from '@/components/shadcn/card';
import { Plus, Calendar, Users } from 'lucide-react';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { firestore } from '@/main';

interface EventInfo {
  id: string;
  name: string;
  createdAt?: any;
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
  const [newEventName, setNewEventName] = useState('');
  const [newEventPassword, setNewEventPassword] = useState('');
  const [creating, setCreating] = useState(false);

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

  const handleCreateEvent = async () => {
    if (newEventName.trim() && newEventPassword.trim()) {
      setCreating(true);
      try {
        const eventId = newEventName.toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        
        // Create the event document
        const eventDocRef = doc(firestore, 'events', eventId);
        await setDoc(eventDocRef, {
          name: newEventName.trim(),
          createdAt: new Date(),
          status: 'active',
          description: `Competition event created by admin`
        });

        // Create the app_config for the new event with the password
        const appConfigRef = doc(firestore, 'events', eventId, 'app_config', 'auth_settings');
        await setDoc(appConfigRef, {
          eventPassword: newEventPassword.trim(),
          createdAt: new Date()
        });

        console.log(`Created new event: ${eventId} with password`);
        
        // Reset form
        setShowCreateForm(false);
        setNewEventName('');
        setNewEventPassword('');
        
        // Reload events list to show the new event
        await loadAvailableEvents();
        
        // Redirect to login for the new event
        window.location.href = `/login?event=${eventId}`;
      } catch (error) {
        console.error('Error creating event:', error);
        alert('Failed to create event. Please try again.');
      } finally {
        setCreating(false);
      }
    }
  };

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
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium mb-3">Create New Event</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Event Name</label>
                <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="e.g., Porto 2025, Madrid 2026"
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={creating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Admin Password</label>
                <input
                  type="password"
                  value={newEventPassword}
                  onChange={(e) => setNewEventPassword(e.target.value)}
                  placeholder="Set a password for this event"
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={creating}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateEvent()}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleCreateEvent} 
                  disabled={!newEventName.trim() || !newEventPassword.trim() || creating}
                  className="flex-1"
                >
                  {creating ? 'Creating...' : 'Create Event'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewEventName('');
                    setNewEventPassword('');
                  }}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </div>
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