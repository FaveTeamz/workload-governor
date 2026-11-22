/**
 * tests/unit/seed-mock-data.test.ts
 *
 * Unit tests for scripts/seed-mock-data.ts verifying idempotent insertion of
 * organizations, maintainers, open issues, pending applications, and
 * assignments as well as transaction rollback on error.
 */

import { Pool } from 'pg';
import {
  seedMockData,
  MOCK_ORGS,
  MOCK_MAINTAINERS,
  MOCK_ISSUES,
  MOCK_APPLICATIONS,
  MOCK_ASSIGNMENTS,
} from '../../scripts/seed-mock-data';

describe('seedMockData (scripts/seed-mock-data.ts)', () => {
  it('commits a transaction inserting sample orgs, maintainers, issues, applications, and assignments', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const releaseMock = jest.fn();
    const mockPool = {
      connect: jest.fn().mockResolvedValue({
        query: queryMock,
        release: releaseMock,
      }),
    } as unknown as Pool;

    const summary = await seedMockData(mockPool);

    expect(summary).toEqual({
      orgs: MOCK_ORGS.length,
      maintainers: MOCK_MAINTAINERS.length,
      issues: MOCK_ISSUES.length,
      applications: MOCK_APPLICATIONS.length,
      assignments: MOCK_ASSIGNMENTS.length,
    });

    expect(queryMock).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(queryMock).toHaveBeenLastCalledWith('COMMIT');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('rolls back the transaction and releases the client when a query fails', async () => {
    const queryMock = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockRejectedValueOnce(new Error('simulated DB failure'));
    const releaseMock = jest.fn();
    const mockPool = {
      connect: jest.fn().mockResolvedValue({
        query: queryMock,
        release: releaseMock,
      }),
    } as unknown as Pool;

    await expect(seedMockData(mockPool)).rejects.toThrow('simulated DB failure');
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
