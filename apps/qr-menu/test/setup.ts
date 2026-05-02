import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest does not auto-cleanup React Testing Library renders between
// tests; mount + unmount each test explicitly.
afterEach(cleanup);
