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

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'Event history');

    const style = document.createElement('style');
    style.textContent = EventHistoryTable.CSS;
    this._container.appendChild(style);

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
        td.innerHTML = this._detailHTML(ev);
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
        ${this._expanded.has(i) ? `<div class="eht-card-detail">${this._detailHTML(ev)}</div>` : ''}
      `;
      li.addEventListener('click', () => this._toggleExpand(i, li, ev));
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') this._toggleExpand(i, li, ev); });
      list.appendChild(li);
    });

    return list;
  }

  _detailHTML(ev) {
    return `
      <dl class="eht-dl">
        <dt>Ledger hash</dt><dd>${ev.ledgerHash ?? '—'}</dd>
        <dt>Actor</dt><dd>${ev.actor ?? '—'}</dd>
        ${ev.contributor ? `<dt>Contributor</dt><dd>${ev.contributor}</dd>` : ''}
        <dt>Org</dt><dd>${ev.org ?? '—'}</dd>
        <dt>Issue</dt><dd>${ev.issue ?? '—'}</dd>
      </dl>`;
  }

  _toggleExpand(i, el, ev) {
    if (this._expanded.has(i)) {
      this._expanded.delete(i);
    } else {
      this._expanded.add(i);
    }
    this._render();
  }

  // ── CSS ───────────────────────────────────────────────────────────────────

  static CSS = `
.eht-table { width:100%; border-collapse:collapse; font-size:.9rem; }
.eht-table th, .eht-table td { padding:.5rem .75rem; border-bottom:1px solid #ddd; text-align:left; }
.eht-table thead th { background:#f5f5f5; font-weight:600; }
.eht-sortable { cursor:pointer; user-select:none; }
.eht-sortable:hover { background:#ebebeb; }
.eht-row { cursor:pointer; }
.eht-row:hover { background:#fafafa; }
.eht-detail td { background:#f9f9f9; padding:.75rem 1rem; }
.eht-dl { margin:0; display:grid; grid-template-columns:max-content 1fr; gap:.25rem .75rem; }
.eht-dl dt { font-weight:600; color:#555; }
.eht-dl dd { margin:0; word-break:break-all; }
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
`;
}
