import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';

afterEach(() => {
  cleanup();
  localStorage.removeItem('wg-theme');
  delete document.documentElement.dataset.theme;
  document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');
});

function renderToggle() {
  return render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
}

describe('ThemeToggle', () => {
  it('uses the system theme by default', () => {
    renderToggle();
    expect((screen.getByRole('combobox', { name: 'Theme' }) as HTMLSelectElement).value).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('system');
  });

  it('applies and persists each preference on selection', () => {
    renderToggle();
    const select = screen.getByRole('combobox', { name: 'Theme' });
    for (const preference of ['dark', 'light', 'high-contrast', 'system']) {
      fireEvent.change(select, { target: { value: preference } });
      expect(document.documentElement.dataset.theme).toBe(preference);
      expect(localStorage.getItem('wg-theme')).toBe(preference);
      expect(document.documentElement.className).toBe(preference === 'system' ? '' : `theme-${preference}`);
    }
  });

  it('restores the saved choice when remounted', () => {
    localStorage.setItem('wg-theme', 'dark');
    const { unmount } = renderToggle();
    unmount();
    renderToggle();
    expect((screen.getByRole('combobox', { name: 'Theme' }) as HTMLSelectElement).value).toBe('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });
});
