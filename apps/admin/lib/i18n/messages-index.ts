import ru from './messages/ru.json';
import en from './messages/en.json';
import type { Locale } from './locales';

type Messages = typeof ru;

export const MESSAGES: Record<Locale, Messages> = { ru, en };
