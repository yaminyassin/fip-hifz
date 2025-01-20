# Jury Panel Implementation

## Overview
The jury panel is a crucial component that allows jury members to evaluate participants across multiple questions. The implementation includes question tracking, score management, and completion status updates.

## Components Structure

### 1. Jury Route Component (`/src/routes/jury.lazy.tsx`)
The main jury interface component that handles:
- Question navigation
- Score input
- Progress tracking
- Completion status

```tsx
function RouteComponent() {
  const [selectedQuestion, setSelectedQuestion] = useState(1);
  const { data: participant } = useActiveParticipant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ... component implementation
}
```

### 2. Score Category Component
Manages score input for different evaluation categories:
- Hifz (Reminder and Assistance)
- Tajweed (Minor and Major Mistakes)
- Fluency

## Data Models

### Jury Progress Model
```typescript
export type Jury = {
  id: string;
  name: string;
  currentQuestion: number;
  hasFinishedEvaluating: boolean;
};
```

## Firebase Integration

### Jury Progress Management
```typescript
export const updateJuryProgress = async (
  juryId: string,
  currentQuestion: number,
  hasFinishedEvaluating: boolean
) => {
  const juryRef = doc(firestore, "jury", juryId);
  
  await updateDoc(juryRef, {
    currentQuestion,
    hasFinishedEvaluating,
  });
};
```

## Features

### 1. Question Navigation
- Visual indicators for current question
- Disabled state during updates
- Automatic progression after completion
```tsx
const handleQuestionChange = (questionNumber: number) => {
  setSelectedQuestion(questionNumber);
  updateJuryMutation.mutate({
    currentQuestion: questionNumber,
    hasFinishedEvaluating: false,
  });
};
```

### 2. Completion Handling
- Automatic progression to next question
- Final question completion state
- Toast notifications for feedback
```tsx
const handleDone = async () => {
  const isLastQuestion = selectedQuestion === 3;
  
  if (isLastQuestion) {
    updateJuryMutation.mutate({
      currentQuestion: selectedQuestion,
      hasFinishedEvaluating: true,
    });
    toast({
      title: "Evaluation Complete",
      description: "You have completed evaluating all questions for this participant.",
    });
  } else {
    // Progress to next question...
  }
};
```

### 3. Score Management
- Real-time score updates
- Category-based scoring
- Loading states and error handling

## Technical Implementation

### State Management
- Uses React Query for server state
- Local state for current question
- Optimistic updates for better UX

### Mutations
```typescript
const updateJuryMutation = useMutation({
  mutationFn: async ({ currentQuestion, hasFinishedEvaluating }) => {
    await updateJuryProgress(juryId, currentQuestion, hasFinishedEvaluating);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["jury"] });
  },
});
```

### User Feedback
- Toast notifications for actions
- Visual loading states
- Disabled states during operations

## UI Components

### 1. Navigation Bar
```tsx
<div className="flex flex-row items-center bg-gray-300 p-4 gap-4 mt-auto">
  <div className="flex flex-row gap-4">
    {[1, 2, 3].map((q) => (
      <Button
        key={q}
        className={`h-12 w-20 rounded-lg ${
          selectedQuestion === q
            ? "bg-blue-600 hover:bg-blue-500"
            : "bg-gray-600 hover:bg-gray-500"
        } text-white font-bold transition-colors`}
        onClick={() => handleQuestionChange(q)}
        disabled={updateJuryMutation.isPending}
      >
        Q{q}
      </Button>
    ))}
  </div>
</div>
```

### 2. Score Categories
```tsx
<ScoreCategory
  title="Hifz"
  labels={["Reminder", "Assisted"]}
  fields={["hifz_reminder", "hifz_assistance"]}
  juryId={juryId}
  participantId={participant?.id}
  questionNumber={selectedQuestion}
/>
```

## Error Handling
- Loading states for data fetching
- Disabled states during mutations
- Toast notifications for errors
- Graceful fallbacks for missing data

## Usage

1. Navigate to `/jury` route
2. Select or wait for active participant
3. Input scores for each category
4. Click "Done" to progress or complete
5. Monitor progress through question indicators

## Dependencies
- @tanstack/react-query
- firebase/firestore
- @radix-ui/react-toast
- shadcn/ui components 