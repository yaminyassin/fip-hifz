# Jury Authentication Implementation

## Overview
This implementation adds authentication functionality to the jury panel, allowing jury members to log in using their unique Firebase document IDs and maintain their session state.

## Key Features
- Secure jury authentication using Firebase document IDs
- Session persistence using browser's session storage
- Proper login/logout flow with navigation
- Error handling and user feedback
- Back navigation to main screen

## Technical Implementation

### 1. Authentication Service (`src/services/juryAuth.ts`)
```typescript
import { firestore } from "@/main";
import { doc, getDoc } from "firebase/firestore";
import { Jury } from "@/models/models";

export const authenticateJury = async (juryId: string): Promise<Jury | null> => {
  try {
    const juryRef = doc(firestore, "jury", juryId);
    const juryDoc = await getDoc(juryRef);

    if (!juryDoc.exists()) {
      return null;
    }

    return {
      id: juryDoc.id,
      ...juryDoc.data()
    } as Jury;
  } catch (error) {
    console.error("Error authenticating jury:", error);
    return null;
  }
};

// Session Storage Management
export const setAuthenticatedJury = (juryId: string) => {
  sessionStorage.setItem("authenticatedJuryId", juryId);
};

export const getAuthenticatedJury = (): string | null => {
  return sessionStorage.getItem("authenticatedJuryId");
};

export const clearAuthenticatedJury = () => {
  sessionStorage.removeItem("authenticatedJuryId");
};
```

### 2. Login Component (`src/components/ui/JuryLogin.tsx`)
```typescript
interface JuryLoginProps {
  onLoginSuccess: () => void;
}

export const JuryLogin = ({ onLoginSuccess }: JuryLoginProps) => {
  const [juryCode, setJuryCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const jury = await authenticateJury(juryCode);
      if (jury) {
        setAuthenticatedJury(jury.id);
        toast({ title: "Login Successful" });
        onLoginSuccess();
      } else {
        toast({ 
          title: "Invalid Code",
          variant: "destructive" 
        });
      }
    } catch (error) {
      toast({ 
        title: "Error",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };
};
```

### 3. Jury Route Authentication (`src/routes/jury.lazy.tsx`)
```typescript
function RouteComponent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Check authentication on mount
  useEffect(() => {
    const juryId = getAuthenticatedJury();
    setIsAuthenticated(!!juryId);
  }, []);

  const handleLogout = () => {
    clearAuthenticatedJury();
    setIsAuthenticated(false);
    queryClient.clear();
    navigate({ to: "/" });
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <JuryLogin onLoginSuccess={handleLoginSuccess} />;
  }
}
```

## Firebase Document Structure
```typescript
interface Jury {
  id: string;                  // Firebase document ID (used as auth code)
  name: string;                // Jury member's name
  currentQuestion: number;     // Current question being evaluated
  hasFinishedEvaluating: boolean; // Evaluation status
}
```

## Authentication Flow
1. Jury member receives their unique Firebase document ID
2. They enter this ID in the login screen
3. System verifies the ID against Firebase jury collection
4. If valid:
   - Stores jury ID in session storage
   - Updates authentication state
   - Shows jury panel
5. If invalid:
   - Shows error message
   - Keeps user on login screen

## Session Management
- Authentication state persists in session storage
- Cleared on logout or browser session end
- Prevents need for repeated logins
- Secure as it's cleared when browser closes

## Navigation
- Successful login: Shows jury panel
- Logout: Returns to main screen
- Back button: Returns to main screen from login
- Invalid/expired session: Shows login screen

## Error Handling
- Invalid jury codes
- Network errors
- Firebase connection issues
- Session expiration

## Security Considerations
- Uses Firebase document IDs as secure tokens
- Session storage for temporary persistence
- No sensitive data stored locally
- Automatic session clearing on browser close 