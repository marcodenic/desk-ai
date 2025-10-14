# Testing Guide

This project includes comprehensive tests for both frontend and backend code.

## Frontend Tests (TypeScript/React)

The frontend tests use [Vitest](https://vitest.dev/) as the test runner and [@testing-library/react](https://testing-library.com/react) for component testing.

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode (useful during development)
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### Test Files

Frontend tests are located in `src/test/`:
- `utils.test.ts` - Tests for utility functions like `cn()` class name merger
- `types.test.ts` - Type validation tests for TypeScript interfaces
- `setup.ts` - Test setup and Tauri API mocks

### Writing New Tests

Create test files with the `.test.ts` or `.test.tsx` extension in the `src/test/` directory:

```typescript
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

## Backend Tests (Rust)

The backend tests use Rust's built-in testing framework.

### Running Tests

```bash
# Run all backend tests
cd rust-backend
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_elevation_detection_unix
```

### Test Files

Backend tests are located in the same files as the code they test, in `#[cfg(test)]` modules:
- `src/tools.rs` - Contains tests for tool execution, elevation detection, and output handling

### Writing New Tests

Add tests in a `#[cfg(test)]` module at the end of the file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        assert_eq!(2 + 2, 4);
    }
}
```

## Continuous Testing

It's recommended to run tests in watch mode during development:

```bash
# Terminal 1: Frontend tests
npm test -- --watch

# Terminal 2: Backend tests
cd rust-backend && cargo watch -x test
```

## Test Coverage

- Frontend: Run `npm run test:coverage` to generate a coverage report in `coverage/`
- Backend: Use `cargo tarpaulin` for Rust code coverage (install with `cargo install cargo-tarpaulin`)

## Mocking Tauri APIs

The test setup automatically mocks Tauri APIs. See `src/test/setup.ts` for mock implementations.

For component tests that use Tauri, the mocks will intercept API calls:

```typescript
import { invoke } from '@tauri-apps/api/core';

// In tests, this will use the mock
const result = await invoke('my_command');
```
