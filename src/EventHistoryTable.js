/**
 * EventHistoryTable
 *
 * Renders a responsive, sortable event history table.
 * Desktop: full 5-column table.
 * Mobile (≤ 640 px): collapses to card view showing Date, Action, Status.
 * Row click / card click expands full details (ledger hash, full addresses).
 *
 * Usage:
 *   const table = new EventHistoryTable(document.getElementById('event-history'), events);
 *
 * Event shape expected:
 *   {
 *     date:        string   // ISO-8601 or human-readable
 *     action:      string   // e.g. "app_sub", "assigned"
 *     org:         string
 *     issue:       string | number
 *     status:      string   // e.g. "pending", "active", "completed"
 *     ledgerHash:  string
 *     actor:       string   // primary actor address (full)
 *     contributor: string   // contributor address (full, optional)
 *   }
 */
export class EventHistoryTable {
  /** @param {HTMLElement} container @param {object[]} events */
  constructor(container, events) {
    this._container = container;
    this._events = events;
    this._sort = { col: 'date', dir: 'desc' };
    this._expanded = new Set();
    this._render();
  }

  // ── Sorting ──────────────────────────────────────────────────────────────

  _sorted() {
    const { col, dir } = this._sort;
    return [...this._events].sort((a, b) => {
      const av = col === 'date' ? new Date(a[col]).getTime() : (a[col] ?? '').toString().toLowerCase();
      const bv = col === 'date' ? new Date(b[col]).getTime() : (b[col] ?? '').toString().toLowerCase();
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  _toggleSort(col) {
    if (this._sort.col === col) {
      this._sort.dir = this._sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sort = { col, dir: 'asc' };
    }
    this._render();
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────

  /**
   * Copies `text` to the clipboard using the async Clipboard API when
   * available, falling back to `document.execCommand('copy')`.
   *
   * @param {string} text
   * @returns {Promise<boolean>} true on success, false on failure
   */
  static async _copyText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        // execCommand fallback for non-secure contexts / older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        textarea.setAttribute('aria-hidden', 'true');
        textarea.setAttribute('tabindex', '-1');
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('execCommand copy failed');
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a copy icon button that announces success/failure to screen
   * readers via an adjacent `aria-live="polite"` element.
   *
   * @param {string} text       Text to copy.
   * @param {string} ariaLabel  Accessible button label.
   * @returns {HTMLSpanElement} Wrapper containing the button + live region.
   */
  static _makeCopyButton(text, ariaLabel) {
    const wrapper = document.createElement('span');
    wrapper.className = 'eht-copy-wrapper';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '0.25rem';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eht-copy-btn';
    btn.setAttribute('aria-label', ariaLabel);
    btn.title = ariaLabel;
    btn.innerHTML = EventHistoryTable._COPY_ICON;

    // Visually-hidden live region for screen reader announcements
    const announce = document.createElement('span');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');
    announce.setAttribute('aria-atomic', 'true');
    Object.assign(announce.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
      borderWidth: '0',
    });

    let resetTimer = null;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // don't trigger row expand
      if (resetTimer !== null) clearTimeout(resetTimer);

      const ok = await EventHistoryTable._copyText(text);

      if (ok) {
        btn.innerHTML = EventHistoryTable._CHECK_ICON;
        btn.classList.add('eht-copy-btn--copied');
        announce.textContent = 'Copied';
        resetTimer = setTimeout(() => {
          btn.innerHTML = EventHistoryTable._COPY_ICON;
          btn.classList.remove('eht-copy-btn--copied');
          announce.textContent = '';
          resetTimer = null;
        }, 2000);
      } else {
        btn.innerHTML = EventHistoryTable._ERROR_ICON;
        btn.classList.add('eht-copy-btn--error');
        announce.textContent = 'Copy failed';
        resetTimer = setTimeout(() => {
          btn.innerHTML = EventHistoryTable._COPY_ICON;
          btn.classList.remove('eht-copy-btn--error');
          announce.textContent = '';
          resetTimer = null;
        }, 2000);
      }
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(announce);
    return wrapper;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'Event history');

    const style = document.createElement('style');
    style.textContent = EventHistoryTable.CSS;
    this._container.appendChild(style);

    // Toolbar (hidden in print via @media print)
    const toolbar = this._buildToolbar();
    this._container.appendChild(toolbar);

    // Desktop table
    const table = this._buildTable();
    this._container.appendChild(table);

    // Mobile card list
    const cards = this._buildCards();
    this._container.appendChild(cards);
  }

  _sortIndicator(col) {
    if (this._sort.col !== col) return '';
    return this._sort.dir === 'asc' ? ' ▲' : ' ▼';
  }

  _buildTable() {
    const SORTABLE = ['date', 'action'];
    const COLS = ['date', 'action', 'org', 'issue', 'status'];

    const table = document.createElement('table');
    table.className = 'eht-table';

    // thead
    const thead = table.createTHead();
    const hr = thead.insertRow();
    COLS.forEach(col => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = col.charAt(0).toUpperCase() + col.slice(1) + this._sortIndicator(col);
      if (SORTABLE.includes(col)) {
        th.className = 'eht-sortable';
        th.setAttribute('aria-sort', this._sort.col === col
          ? (this._sort.dir === 'asc' ? 'ascending' : 'descending')
          : 'none');
        th.tabIndex = 0;
        th.addEventListener('click', () => this._toggleSort(col));
        th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') this._toggleSort(col); });
      }
      hr.appendChild(th);
    });

    // tbody
    const tbody = table.createTBody();
    this._sorted().forEach((ev, i) => {
      const row = tbody.insertRow();
      row.className = 'eht-row';
      row.setAttribute('aria-expanded', String(this._expanded.has(i)));
      row.tabIndex = 0;
      COLS.forEach(col => {
        const td = row.insertCell();
        td.textContent = ev[col] ?? '—';
      });
      row.addEventListener('click', () => this._toggleExpand(i, row, ev));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') this._toggleExpand(i, row, ev); });

      if (this._expanded.has(i)) {
        const detail = tbody.insertRow();
        detail.className = 'eht-detail';
        const td = detail.insertCell();
        td.colSpan = COLS.length;
        this._appendDetail(td, ev);
      }
    });

    return table;
  }

  _buildCards() {
    const list = document.createElement('ul');
    list.className = 'eht-cards';
    list.setAttribute('aria-label', 'Event history');

    this._sorted().forEach((ev, i) => {
      const li = document.createElement('li');
      li.className = 'eht-card';
      li.setAttribute('aria-expanded', String(this._expanded.has(i)));
      li.tabIndex = 0;
      li.innerHTML = `
        <span class="eht-card-date">${ev.date ?? '—'}</span>
        <span class="eht-card-action">${ev.action ?? '—'}</span>
        <span class="eht-card-status">${ev.status ?? '—'}</span>
      `;
      if (this._expanded.has(i)) {
        const detail = document.createElement('div');
        detail.className = 'eht-card-detail';
        this._appendDetail(detail, ev);
        li.appendChild(detail);
      }
      li.addEventListener('click', () => this._toggleExpand(i, li, ev));
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') this._toggleExpand(i, li, ev); });
      list.appendChild(li);
    });

    return list;
  }

  /**
   * Builds and appends the expanded detail view into `container`.
   * Ledger hash and addresses get individual copy buttons.
   *
   * @param {HTMLElement} container
   * @param {object} ev
   */
  _appendDetail(container, ev) {
    const dl = document.createElement('dl');
    dl.className = 'eht-dl';

    const addRow = (label, value, copyable = false) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');

      if (copyable && value && value !== '—') {
        const code = document.createElement('code');
        code.className = 'eht-hash';
        code.textContent = value;
        dd.appendChild(code);
        dd.appendChild(
          EventHistoryTable._makeCopyButton(value, `Copy ${label.toLowerCase()}`)
        );
      } else {
        dd.textContent = value ?? '—';
      }

      dl.appendChild(dt);
      dl.appendChild(dd);
    };

    addRow('Ledger hash', ev.ledgerHash, true);
    addRow('Actor', ev.actor, true);
    if (ev.contributor) addRow('Contributor', ev.contributor, true);
    addRow('Org', ev.org);
    addRow('Issue', ev.issue != null ? String(ev.issue) : null);

    container.appendChild(dl);
  }

  _toggleExpand(i, el, ev) {
    if (this._expanded.has(i)) {
      this._expanded.delete(i);
    } else {
      this._expanded.add(i);
    }
    this._render();
  }

  // ── SVG icon templates ────────────────────────────────────────────────────

  static _COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  static _CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>`;

  static _ERROR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  // ── CSS ───────────────────────────────────────────────────────────────────

  static CSS = `
/* ── Toolbar ─────────────────────────────────────────────────────────── */
.eht-toolbar {
  display: flex;
  gap: .5rem;
  justify-content: flex-end;
  margin-bottom: .75rem;
}
.eht-btn {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  padding: .375rem .875rem;
  border: 1.5px solid currentColor;
  border-radius: 5px;
  font-size: .8125rem;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  transition: background .15s, color .15s;
  white-space: nowrap;
}
.eht-btn:focus-visible { outline: 2px solid #facc15; outline-offset: 2px; }
.eht-btn-export { color: #6c8eff; }
.eht-btn-export:hover { background: #6c8eff; color: #fff; }
.eht-btn-print  { color: #94a3b8; }
.eht-btn-print:hover  { background: #94a3b8; color: #fff; }

/* ── Table ───────────────────────────────────────────────────────────── */
.eht-table { width:100%; border-collapse:collapse; font-size:.9rem; }
.eht-table th, .eht-table td { padding:.5rem .75rem; border-bottom:1px solid #ddd; text-align:left; }
.eht-table thead th { background:#f5f5f5; font-weight:600; }
.eht-sortable { cursor:pointer; user-select:none; }
.eht-sortable:hover { background:#ebebeb; }
.eht-row { cursor:pointer; }
.eht-row:hover { background:#fafafa; }
.eht-detail td { background:#f9f9f9; padding:.75rem 1rem; }
.eht-dl { margin:0; display:grid; grid-template-columns:max-content 1fr; gap:.25rem .75rem; align-items:center; }
.eht-dl dt { font-weight:600; color:#555; }
.eht-dl dd { margin:0; word-break:break-all; display:inline-flex; align-items:center; gap:.375rem; }
.eht-hash { font-family:monospace; font-size:.85em; }
.eht-copy-btn {
  background: none; border: none; cursor: pointer;
  padding: 0 2px; line-height: 1; color: inherit;
  display: inline-flex; align-items: center;
  border-radius: 3px;
}
.eht-copy-btn:hover { opacity: .7; }
.eht-copy-btn--copied { color: #22c55e; }
.eht-copy-btn--error  { color: #ef4444; }
.eht-cards { display:none; list-style:none; margin:0; padding:0; }
.eht-card { border:1px solid #ddd; border-radius:6px; padding:.75rem; margin-bottom:.5rem; cursor:pointer; display:grid; grid-template-columns:1fr 1fr 1fr; gap:.25rem; }
.eht-card-date { font-size:.8rem; color:#777; grid-column:1/-1; }
.eht-card-action { font-weight:600; }
.eht-card-status { text-align:right; font-size:.85rem; }
.eht-card-detail { grid-column:1/-1; margin-top:.5rem; padding-top:.5rem; border-top:1px solid #eee; }

@media (max-width:640px) {
  .eht-table { display:none; }
  .eht-cards { display:block; }
}

/* ── Print ───────────────────────────────────────────────────────────── */
@media print {
  /* Hide interactive chrome inside the component itself */
  .eht-toolbar   { display: none !important; }
  .eht-copy-btn  { display: none !important; }
  .eht-cards     { display: none !important; }
  .eht-sortable  { cursor: default; }

  /* Force the desktop table regardless of viewport */
  .eht-table { display: table !important; }

  /* Clean, high-contrast print table */
  .eht-table th,
  .eht-table td { border: 1px solid #999; padding: .3rem .5rem; font-size: .8rem; }
  .eht-table thead th { background: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .eht-row:hover { background: transparent; }
  .eht-detail td { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Avoid page breaks inside a row's detail panel */
  .eht-row, .eht-detail { break-inside: avoid; }
}
`;
}
