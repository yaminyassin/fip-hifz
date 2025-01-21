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