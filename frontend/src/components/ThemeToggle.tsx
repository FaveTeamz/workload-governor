'use client';

import { useId } from 'react';
import { useTheme, type ThemePreference } from '../context/ThemeContext';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const id = useId();

  return (
    <div className="theme-toggle">
      <label htmlFor={id}>Theme</label>
      <select id={id} value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="high-contrast">High contrast</option>
      </select>
    </div>
  );
}
