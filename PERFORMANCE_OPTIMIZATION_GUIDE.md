# Performance Optimization Guide for FIP-HIFZ

## 🚀 Performance Improvements Implemented

### 1. Fixed Critical Memory Leak in `useParticipants` Hook

**Problem**: Nested listeners were being created inside the participants listener callback, causing new listeners to be created every time participants changed without cleaning up old ones.

**Solution**: Moved all listeners to the top level of the useEffect hook and implemented proper cleanup.

```typescript
// ❌ Before (Memory Leak)
onSnapshot(participantsRef, (snapshot) => {
  // New listeners created every time!
  const scoresUnsubscribe = onSnapshot(scoresQuery, ...);
});

// ✅ After (Fixed)
useEffect(() => {
  const participantsUnsubscribe = onSnapshot(participantsRef, ...);
  const scoresUnsubscribe = onSnapshot(scoresQuery, ...);
  
  return () => {
    participantsUnsubscribe();
    scoresUnsubscribe();
  };
}, []);
```

### 2. Optimized React Query Configuration

**Problem**: Default QueryClient settings were causing unnecessary refetches and not optimized for real-time data.

**Solution**: Configured QueryClient with settings specifically for real-time applications.

```typescript
const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});
```

### 3. Centralized Listener Management

**Problem**: Multiple components creating duplicate listeners for the same data.

**Solution**: Created `useFirestoreListener` hook that manages listeners centrally with reference counting.

```typescript
// Prevents duplicate listeners
useFirestoreListener({
  query: q,
  key: "activeParticipant", // Unique key for deduplication
  onData: (snapshot) => { /* handle data */ },
});
```

### 4. Performance Monitoring

**Problem**: No visibility into performance issues during runtime.

**Solution**: Created `PerformanceMonitor` component to track:
- Active Firestore listeners
- Memory usage
- Performance warnings

### 5. Optimized Data Processing

**Problem**: Processing ALL scores for ALL participants on every change.

**Solution**: 
- Use Maps for O(1) lookups instead of array iterations
- Process only changed data
- Batch updates when possible

## 📋 Implementation Checklist

### Immediate Actions Required:

1. **Update all hooks to use centralized listener**:
   - [ ] Update `useJuryMember` hook
   - [ ] Update `useJuryMembers` hook
   - [ ] Update `useParticipantScores` hook
   - [ ] Update `useJuryAuth` hook

2. **Add Performance Monitor to Admin page**:
   ```typescript
   // In admin.lazy.tsx
   import { PerformanceMonitor } from "@/components/ui/PerformanceMonitor";
   
   // Add to component
   {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}
   ```

3. **Implement auto-refresh mechanism**:
   ```typescript
   // Add to critical pages
   useEffect(() => {
     const timeout = setTimeout(() => {
       if (confirm("Page has been running for 2 hours. Refresh for optimal performance?")) {
         window.location.reload();
       }
     }, 2 * 60 * 60 * 1000); // 2 hours
     
     return () => clearTimeout(timeout);
   }, []);
   ```

## 🛡️ Best Practices

### 1. Listener Management
- Always use `useFirestoreListener` for consistency
- Use meaningful keys for listener deduplication
- Avoid creating listeners in loops or callbacks

### 2. State Updates
- Use `useDebouncedState` for frequently changing values
- Batch related state updates together
- Avoid updating state in rapid succession

### 3. Component Optimization
- Memoize expensive computations with `useMemo`
- Wrap components with `React.memo` when appropriate
- Use `useCallback` for stable function references

### 4. Firestore Queries
- Use `limit()` when fetching large collections
- Enable offline persistence for better performance
- Use compound indexes for complex queries

## 🔍 Monitoring & Debugging

### Check Performance Health:
```typescript
// In browser console
import { getListenerStats } from "@/hooks/useFirestoreListener";
console.log(getListenerStats());
```

### Clean up all listeners (emergency):
```typescript
import { cleanupAllListeners } from "@/hooks/useFirestoreListener";
cleanupAllListeners();
```

## 📊 Expected Improvements

- **Memory Usage**: 50-70% reduction in memory consumption
- **Page Responsiveness**: No more slowdowns after extended use
- **Listener Count**: Reduced from 20+ to 5-8 active listeners
- **Real-time Updates**: More reliable and consistent

## 🚨 Warning Signs to Watch For

1. **High Listener Count**: More than 10 active listeners
2. **Memory Growth**: Steady increase in memory usage over time
3. **Slow Interactions**: Delayed response to user actions
4. **Console Errors**: Firestore quota or permission errors

## 🔧 Maintenance

### Weekly:
- Monitor performance metrics during competitions
- Check for any new memory leaks
- Review listener usage patterns

### After Each Competition:
- Analyze performance logs
- Identify any bottlenecks
- Update optimization strategies as needed 