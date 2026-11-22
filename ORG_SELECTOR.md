# Organization Selector Component

`frontend/src/components/OrgSelector.tsx`

## Features

- **Real-time search**: Filters organisations by name or ID as the user types
- **Recent orgs**: The last 5 used orgs are persisted to `localStorage` and shown in a "Recent" section at the top of the dropdown
- **Keyboard navigation**: Arrow Up/Down to move, Enter to select, Escape to close
- **Accessible**: ARIA combobox pattern (`role="combobox"` on the input, `role="listbox"` on the list, `role="option"` on each item, `aria-activedescendant` tracking, `aria-expanded` on the trigger)
- **Mobile-friendly**: Full-screen modal overlay on small viewports (via CSS media query targeting the `.org-selector--open` modifier)
- **Assignment counts**: Displays `X/4` next to each org to show current workload

## Usage

```tsx
import { OrgSelector, type Org } from './components/OrgSelector';

const orgs: Org[] = [
  { id: 'stellar-org', name: 'Stellar Org', assignmentCount: 1 },
  { id: 'meridian-dao', name: 'Meridian DAO', assignmentCount: 0 },
];

function MyPage() {
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  return (
    <OrgSelector
      orgs={orgs}
      value={selectedOrg}
      onChange={(org) => setSelectedOrg(org.id)}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `orgs` | `Org[]` | required | Full list of available organisations |
| `value` | `string \| null` | required | Currently selected org id |
| `onChange` | `(org: Org) => void` | required | Called when user selects an org |
| `placeholder` | `string` | `"Search orgs…"` | Search input placeholder |
| `maxRecent` | `number` | `5` | Max number of recent orgs to store |
| `storageKey` | `string` | `"wg_recent_orgs"` | localStorage key for recent orgs |

## Org type

```ts
interface Org {
  id: string;            // unique identifier
  name: string;          // display name
  assignmentCount?: number; // active assignments (shown as X/4)
}
```

## Keyboard Navigation

| Key | Action |
|---|---|
| `ArrowDown` | Move selection down (wraps to top) |
| `ArrowUp` | Move selection up (wraps to bottom) |
| `Enter` | Select the currently highlighted org |
| `Escape` | Close the dropdown without selecting |
| `Tab` | Close the dropdown without selecting |

## Recent Orgs

- Up to `maxRecent` (default 5) recently selected orgs are stored in `localStorage` under `wg_recent_orgs`
- When no search query is active, a "Recent" section is shown above "All orgs"
- When a search query is active, the recent section is hidden and only filtered results are shown
- Selecting an org moves it to the front of the recent list

## Accessibility

- Trigger button: `role` is implicit `button`, uses `aria-haspopup="listbox"` and `aria-expanded`
- Search input: `role="combobox"`, `aria-autocomplete="list"`, `aria-controls` → listbox id, `aria-activedescendant` → active option id
- Option list: `role="listbox"`
- Options: `role="option"`, `aria-selected`
- Section headers: `aria-hidden="true"` (decorative, not part of the option list for AT)

## Implementation Notes

- Dropdown closes on outside click via a `mousedown` listener on `document`
- `scrollIntoView` is called on the active item to keep it visible when keyboard-navigating long lists
- The component is self-contained with no external state management dependencies
