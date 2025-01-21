# Internationalization (i18n) Implementation

## Overview
This implementation adds multi-language support to the application using react-i18next. The initial implementation supports English (EN) and Portuguese (PT) with the ability to easily add more languages.

## Dependencies
```bash
npm install react-i18next i18next i18next-browser-languagedetector
```

## File Structure
```
src/
├── i18n.ts                    # i18n configuration
├── locales/
│   ├── en/
│   │   └── translation.json   # English translations
│   └── pt/
│       └── translation.json   # Portuguese translations
└── components/
    └── ui/
        └── LanguageSwitcher.tsx  # Language toggle component
```

## Configuration (i18n.ts)
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import translationEN from './locales/en/translation.json';
import translationPT from './locales/pt/translation.json';

const resources = {
  en: {
    translation: translationEN
  },
  pt: {
    translation: translationPT
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
```

## Language Switcher Component
```typescript
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shadcn/button';

export const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'pt' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2"
    >
      {t('menu.language')}: {i18n.language.toUpperCase()}
    </Button>
  );
};
```

## Translation Structure
The translations are organized in a hierarchical structure:

```json
{
  "menu": {
    "home": "Home",
    "participants": "Participants",
    // ... other menu items
  },
  "jury": {
    "title": "Jury Panel",
    "categories": {
      "hifz": "Hifz",
      // ... other categories
    },
    "actions": {
      "logout": "Logout",
      // ... other actions
    }
  },
  // ... other sections
}
```

## Usage in Components
1. Import and use the translation hook:
```typescript
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();
  
  return <h1>{t('section.key')}</h1>;
};
```

2. Using with variables:
```typescript
t('messages.welcome', { name: 'John' })  // "Welcome, John"
```

3. Using with plurals:
```typescript
t('items', { count: 4 })  // "4 items"
```

## Integration with Root Layout
The LanguageSwitcher is added to the root layout to be accessible from all pages:

```typescript
export const Route = createRootRoute({
  component: () => (
    <>
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      <Outlet />
      <TanStackRouterDevtools />
      <Toaster />
    </>
  ),
});
```

## Features
1. **Language Persistence**: Uses localStorage to remember user's language preference
2. **Auto Detection**: Detects browser language on first visit
3. **Fallback Language**: Uses English as fallback when translation is missing
4. **Dynamic Language Switching**: Instantly updates UI when language is changed
5. **Type Safety**: Translation keys can be typed for better development experience

## Best Practices
1. **Namespace Organization**: Group translations by feature/page
2. **Key Naming**: Use descriptive, hierarchical keys (e.g., 'jury.actions.save')
3. **Placeholders**: Use variables for dynamic content
4. **Fallback Text**: Always provide English translations as fallback
5. **Context**: Add comments in translation files for complex phrases

## Error Handling
1. **Missing Translations**: Falls back to English
2. **Loading State**: Shows keys while translations are loading
3. **Invalid Keys**: Shows key name in development, empty in production

## Adding New Languages
To add a new language:
1. Create new translation file in `src/locales/[lang]/translation.json`
2. Add language to resources in `i18n.ts`
3. Update LanguageSwitcher component if needed

## Testing Considerations
1. Test with different languages
2. Verify text fits in UI elements
3. Check RTL language support if needed
4. Test fallback behavior
5. Verify language persistence 