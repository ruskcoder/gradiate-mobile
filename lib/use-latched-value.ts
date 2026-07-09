import * as React from 'react';

// Keeps the last truthy value across renders, updating in the very same
// render a falsy value arrives (no one-frame lag like an effect would add).
// Uses React's supported "adjust state during render" pattern instead of a
// ref, since refs may not be read or written during render.
export function useLatchedValue<T>(value: T | null | undefined): T | null | undefined {
  const [prevValue, setPrevValue] = React.useState(value);
  const [latched, setLatched] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) setLatched(value);
  }
  return latched;
}
