# FIP Hifz - Quranic Memorization Competition Judging System

A comprehensive web-based platform for managing and judging Quranic memorization competitions. Built with React, TypeScript, and Firebase, this system provides real-time scoring, participant management, and administrative tools for competition organizers.

## Features

### Competition Management
- **Participant Registration**: Complete participant profiles with photos, categories, and question assignments
- **Real-time Jury Scoring**: Multi-criteria evaluation system with instant updates
- **Question Assignment**: Automatic Quran page assignment and management
- **Live Competition Tracking**: Real-time status updates across all interfaces

### Jury Interface
- **Multi-criteria Scoring**: Hifdh (memorization), Tajweed, Waqf & Ibtida, and performance evaluation
- **Real-time Synchronization**: Automatic question navigation when admin changes active questions
- **Optimistic UI Updates**: Smooth user experience with pending save indicators
- **Accessibility Features**: Keyboard navigation and screen reader support

### Administrative Dashboard
- **Participant Management**: Add, edit, and organize competition participants
- **Jury Management**: Control jury member access and evaluation progress
- **Competition Control**: Manage active participants and question flow
- **Performance Monitoring**: Real-time system performance tracking

### Scoring System
- **Weighted Scoring**: Category-based point deduction system
- **Bonus Points**: Overall performance bonuses per participant
- **Score Validation**: Automatic validation rules (e.g., 3+ Hifdh corrections void question)
- **Export Capabilities**: CSV export for final results

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: TailwindCSS, Shadcn/ui components
- **Backend**: Firebase/Firestore
- **State Management**: TanStack Query (React Query)
- **Routing**: TanStack Router
- **Internationalization**: React i18next (English/Portuguese)
- **Build Tools**: Vite, ESLint, PostCSS

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Firebase project with Firestore enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fip-hifz
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Firebase Configuration**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Firestore Database
   - Add your Firebase config to the environment variables

4. **Environment Setup**
   Create a `.env` file with your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

### Building for Production

```bash
npm run build
```

## Project Structure

```
src/
├── components/           # Reusable UI components
│   ├── shadcn/          # Shadcn/ui components
│   └── ui/              # Custom UI components
├── hooks/               # Custom React hooks
├── routes/              # Application routes
├── services/            # Firebase and API services
├── models/              # TypeScript type definitions
├── locales/             # Internationalization files
├── assets/              # Static assets (fonts, images)
└── utils/               # Utility functions

scripts/                 # Database and utility scripts
public/                  # Public static files
```

## Key Components

### Scoring Categories

1. **Hifdh (Memorization)** - Base 100 points per question
   - Judge Corrections: -3 points each
   - Self Corrections: -2 points each
   - 3+ judge corrections void the question

2. **Tajweed** - Pronunciation and recitation rules
   - Major Mistakes: -2 points each
   - Minor Mistakes: -1 point each

3. **Waqf & Ibtida** - Pausing and starting
   - Incorrect Pause/Start: -0.3 points each
   - Meaning-altering Pause/Start: -0.7 points each

4. **Husn al-Ada** - Fluency and performance
   - Performance mistakes: -1 point each

5. **Overall Bonus** - Participant-level bonus (0-5 points)

### Performance Optimizations

- **Centralized Firestore Listeners**: Prevents memory leaks and duplicate subscriptions
- **Optimistic UI Updates**: Immediate feedback with conflict resolution
- **Real-time Synchronization**: Automatic updates across all connected clients
- **Efficient Query Management**: Memoized queries and smart caching

## Usage

### For Competition Administrators

1. **Setup Participants**: Add participant details, photos, and assign questions
2. **Configure Jury**: Set up jury members and assign them to participants
3. **Monitor Competition**: Track progress and manage active participants/questions
4. **Export Results**: Generate final scores and rankings

### For Jury Members

1. **Login**: Access the jury interface with provided credentials
2. **Score Participants**: Evaluate using the multi-criteria scoring system
3. **Navigate Questions**: Switch between assigned questions for each participant
4. **Real-time Updates**: Receive automatic notifications of competition changes

### For Public Display

- **Big Screen Mode**: Display current participant and competition status
- **Randomizer**: Generate random question assignments for participants

## Database Scripts

The `scripts/` directory contains utilities for:
- Participant data import/export
- Score management and cleanup
- Quran page image handling
- Database maintenance

See `scripts/README_database_scripts.md` for detailed information.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use early returns for better readability
- Implement accessibility features (tabindex, aria-labels, keyboard navigation)
- Use descriptive variable and function names with "handle" prefix for event handlers
- Prefer Tailwind classes over custom CSS
- Use consts instead of functions where appropriate

## Performance Considerations

- **Firestore Optimization**: Centralized listeners prevent duplicate subscriptions
- **UI Responsiveness**: Optimistic updates with conflict resolution
- **Memory Management**: Proper cleanup of listeners and timeouts
- **Bundle Optimization**: Code splitting and lazy loading for better performance

## Internationalization

The application supports multiple languages:
- English (default)
- Portuguese

Language files are located in `src/locales/` and can be extended for additional languages.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions, issues, or contributions, please refer to the project's issue tracker or contact the development team.
