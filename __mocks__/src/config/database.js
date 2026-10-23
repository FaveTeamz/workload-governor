/**
 * Manual mock for src/config/database.
 * audit.ts imports { db } from '../config/database' and calls db('table').insert(...).
 */
'use strict';

const insertMock = jest.fn().mockResolvedValue([]);
const tableMock = jest.fn().mockReturnValue({ insert: insertMock });

module.exports = {
  db: tableMock,
};
