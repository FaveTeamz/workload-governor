/**
 * English translations — the reference/default locale.
 * All other locale files must satisfy the Translations type derived here.
 */
export const en = {
  nav: {
    home:     'Home',
    activity: 'Activity',
  },
  dashboard: {
    title: 'WorkloadGovernor',
  },
  common: {
    connect_wallet: 'Connect Wallet',
    disconnect:     'Disconnect',
    language:       'Language',
  },
} as const

/** Structural type derived from the English source-of-truth. */
export type Translations = typeof en
