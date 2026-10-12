import '@testing-library/jest-dom/vitest';
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
