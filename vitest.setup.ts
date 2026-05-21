// Polyfills IndexedDB (jsdom has none) so Dexie-backed tests can open the DB.
import "fake-indexeddb/auto";
// Extends `expect` with @testing-library/jest-dom matchers for component tests.
import "@testing-library/jest-dom/vitest";
