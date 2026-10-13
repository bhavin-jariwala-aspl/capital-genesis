import '@testing-library/jest-dom';
import React from 'react';
// Make React available globally so components that rely on the classic JSX
// transform (React.createElement) work in the Vitest jsdom environment.
globalThis.React = React;
