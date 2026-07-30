/**
 * Migration: 001_initial_schema
 *
 * Establishes the full WorkloadGovernor schema.
 * Tables: orgs, events, issues, maintainers, applications, assignments,
 *         api_keys, github_issue_labels
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('orgs', {
    org_id: { type: 'text', primaryKey: true },
    contract_address: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createTable('events', {
    id: 'id', // SERIAL PRIMARY KEY
    org_id: { type: 'text', notNull: true },
    event_type: { type: 'text', notNull: true },
    issue_id: { type: 'text', notNull: true },
    contributor: { type: 'text', notNull: true },
    tx_hash: { type: 'text', notNull: true },
    occurred_at: { type: 'timestamptz', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('events', 'org_id', { name: 'idx_events_org_id' });
  pgm.createIndex('events', 'occurred_at', { name: 'idx_events_occurred_at' });

  pgm.createTable('issues', {
    id: 'id', // SERIAL PRIMARY KEY
    org_id: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: "'open'" },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createTable('maintainers', {
    address: { type: 'text', notNull: true },
    org_id: { type: 'text', notNull: true },
  });
  pgm.addConstraint('maintainers', 'maintainers_pkey', 'PRIMARY KEY (address, org_id)');

  pgm.createTable('applications', {
    contributor: { type: 'text', notNull: true },
    org_id: { type: 'text', notNull: true },
    issue_id: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });
  pgm.addConstraint(
    'applications',
    'applications_pkey',
    'PRIMARY KEY (contributor, org_id, issue_id)',
  );

  pgm.createTable('assignments', {
    contributor: { type: 'text', notNull: true },
    org_id: { type: 'text', notNull: true },
    issue_id: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });
  pgm.addConstraint(
    'assignments',
    'assignments_pkey',
    'PRIMARY KEY (contributor, org_id, issue_id)',
  );

  pgm.createTable('api_keys', {
    id: 'id', // SERIAL PRIMARY KEY
    key_hash: { type: 'text', notNull: true, unique: true },
    label: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createTable('github_issue_labels', {
    org_id: { type: 'text', notNull: true },
    issue_id: { type: 'integer', notNull: true },
    label_name: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });
  pgm.addConstraint(
    'github_issue_labels',
    'github_issue_labels_pkey',
    'PRIMARY KEY (org_id, issue_id, label_name)',
  );
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('github_issue_labels');
  pgm.dropTable('api_keys');
  pgm.dropTable('assignments');
  pgm.dropTable('applications');
  pgm.dropTable('maintainers');
  pgm.dropTable('issues');
  pgm.dropIndex('events', 'occurred_at', { name: 'idx_events_occurred_at' });
  pgm.dropIndex('events', 'org_id', { name: 'idx_events_org_id' });
  pgm.dropTable('events');
  pgm.dropTable('orgs');
};
