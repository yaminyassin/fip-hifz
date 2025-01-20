# Admin Panel Implementation

## Overview
The admin panel is a new feature that provides administrators with the ability to monitor jury members' progress and manage active participants. The panel consists of two main components:
1. Jury Status Table
2. Active Participant Selector

## Components Structure

### 1. Admin Panel Route (`/src/routes/admin.lazy.tsx`)
The main container component that organizes the admin interface:
```tsx
function AdminPanel() {
  return (
    <div className="container mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
      
      <div className="grid grid-cols-1 gap-8">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-6">Jury Status</h2>
          <JuryTable />
        </Card>

        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-6">Active Participant</h2>
          <ParticipantSelector />
        </Card>
      </div>
    </div>
  );
}
```

### 2. Jury Table Component (`/src/components/ui/JuryTable.tsx`)
Displays a table of jury members showing:
- Jury member's name
- Current question being evaluated
- Evaluation status (Completed/In Progress)

Features:
- Real-time updates using React Query
- Visual status indicators
- Responsive design

### 3. Participant Selector Component (`/src/components/ui/ParticipantSelector.tsx`)
Manages the active participant selection:
- Shows current active participant
- Provides a dropdown to select a new participant
- Handles participant activation/deactivation

## Data Models

### Updated Jury Model
```typescript
export type Jury = {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
};
```

## Firebase Integration

### Jury Data Management
- Collection: `jury`
- Fields:
  - `id`: Unique identifier
  - `name`: Jury member's name
  - `currentQuestion`: Current question number being evaluated
  - `hasFinishedEvaluating`: Boolean flag for completion status

### Participant Management
- Collection: `participants`
- Active participant management using batch updates:
  1. Deactivates all participants
  2. Activates the selected participant

## Features

### Jury Status Monitoring
- View all jury members in a table format
- Track current question progress
- Monitor evaluation completion status
- Visual status indicators (green for completed, yellow for in progress)

### Active Participant Management
- View current active participant
- Select new participant from dropdown
- Batch update to ensure only one active participant
- Automatic UI updates using React Query

## Technical Implementation

### State Management
- Uses React Query for server state management
- Local state for participant selection
- Optimistic updates for better UX

### Styling
- Utilizes Tailwind CSS for styling
- Shadcn UI components for consistent design
- Responsive layout

### Error Handling
- Loading states for data fetching
- Error boundaries for component failures
- Graceful fallbacks for missing data

## Usage

1. Navigate to `/admin` route
2. Monitor jury progress in the Jury Status table
3. Manage active participants:
   - View current active participant
   - Select new participant from dropdown
   - Confirm selection to update active status

## Dependencies
- @tanstack/react-query
- @radix-ui/react-select
- firebase/firestore
- tailwindcss
- shadcn/ui components 