/**
 * Migration: 4_webhook_dead_letters
 *
 * Persists failed webhook deliveries for inspection and replay.
 */

'use strict';

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS webhook_dead_letters (
      id SERIAL PRIMARY KEY,
      webhook_id INTEGER NOT NULL,
      payload JSONB NOT NULL,
      last_error TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      last_status_code INTEGER,
      last_response_body TEXT,
      url TEXT NOT NULL DEFAULT '',
      secret TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE webhook_dead_letters
      ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS secret TEXT NOT NULL DEFAULT '';

    CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_created_at
      ON webhook_dead_letters(created_at DESC);
  `);
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('webhook_dead_letters', 'created_at', {
    name: 'idx_webhook_dead_letters_created_at',
    ifExists: true,
  });
  pgm.dropTable('webhook_dead_letters', { ifExists: true });
};