import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ru from './messages/ru.json';
import en from './messages/en.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ru: { translation: ru }, en: { translation: en } },
    fallbackLng: 'ru',
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      caches: ['cookie', 'localStorage'],
    },
    interpolation: { escapeValue: false },
    ns: ['translation'],
    defaultNS: 'translation',
  });

export default i18n;
