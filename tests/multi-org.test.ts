/**
 * Multi-Organization Cap Tests
 * 
 * Tests that organization caps are properly isolated and global caps
 * correctly aggregate across all organizations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkloadGovernor } from '../src/workload-governor';
import { Contributor, Organization, Assignment } from '../src/types';

describe('Multi-Organization Cap Tests', () => {
  let governor: WorkloadGovernor;
  let orgA: Organization;
  let orgB: Organization;
  let contributor: Contributor;

  beforeEach(() => {
    // Setup fresh state for each test
    governor = new WorkloadGovernor();
    
    // Create two organizations
    orgA = governor.createOrganization({
      id: 'org-a',
      name: 'Organization A',
      cap: 5, // Max 5 assignments per contributor
    });
    
    orgB = governor.createOrganization({
      id: 'org-b',
      name: 'Organization B',
      cap: 5, // Max 5 assignments per contributor
    });
    
    // Create a contributor
    contributor = governor.createContributor({
      id: 'contributor-1',
      name: 'Test Contributor',
    });
  });

  describe('Org Cap Isolation', () => {
    it('should allow contributor at org cap in org A to apply in org B', () => {
      // Fill org A cap
      for (let i = 0; i < 5; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-a',
          contributorId: 'contributor-1',
          workloadId: `workload-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Verify contributor is at cap in org A
      const orgACount = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      expect(orgACount).toBe(5);

      // Should still be able to apply in org B
      const assignmentB = governor.createAssignment({
        orgId: 'org-b',
        contributorId: 'contributor-1',
        workloadId: 'workload-b-1',
      });
      
      const result = governor.assignWorkload(assignmentB);
      expect(result.success).toBe(true);
      
      const orgBCount = governor.getContributorAssignmentCount('contributor-1', 'org-b');
      expect(orgBCount).toBe(1);
    });

    it('should track counts separately per org', () => {
      // Add assignments in org A
      for (let i = 0; i < 3; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-a',
          contributorId: 'contributor-1',
          workloadId: `workload-a-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Add assignments in org B
      for (let i = 0; i < 2; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-b',
          contributorId: 'contributor-1',
          workloadId: `workload-b-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Verify counts are separate
      const orgACount = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      const orgBCount = governor.getContributorAssignmentCount('contributor-1', 'org-b');
      const totalCount = governor.getContributorTotalAssignments('contributor-1');

      expect(orgACount).toBe(3);
      expect(orgBCount).toBe(2);
      expect(totalCount).toBe(5);
    });
  });

  describe('Global Cap Testing', () => {
    it('should block contributor at global cap from applying in any org', () => {
      // Set global cap
      governor.setGlobalCap(5);

      // Fill global cap across orgs
      for (let i = 0; i < 3; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-a',
          contributorId: 'contributor-1',
          workloadId: `workload-a-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      for (let i = 0; i < 2; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-b',
          contributorId: 'contributor-1',
          workloadId: `workload-b-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Verify total is at global cap
      const totalCount = governor.getContributorTotalAssignments('contributor-1');
      expect(totalCount).toBe(5);

      // Should not be able to apply in any org
      const assignmentA = governor.createAssignment({
        orgId: 'org-a',
        contributorId: 'contributor-1',
        workloadId: 'workload-a-extra',
      });
      
      const resultA = governor.assignWorkload(assignmentA);
      expect(resultA.success).toBe(false);
      expect(resultA.error).toContain('global cap');

      const assignmentB = governor.createAssignment({
        orgId: 'org-b',
        contributorId: 'contributor-1',
        workloadId: 'workload-b-extra',
      });
      
      const resultB = governor.assignWorkload(assignmentB);
      expect(resultB.success).toBe(false);
      expect(resultB.error).toContain('global cap');
    });

    it('should correctly aggregate counts across all orgs for global cap', () => {
      // Set global cap
      governor.setGlobalCap(10);

      // Add assignments across orgs
      for (let i = 0; i < 4; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-a',
          contributorId: 'contributor-1',
          workloadId: `workload-a-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      for (let i = 0; i < 3; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-b',
          contributorId: 'contributor-1',
          workloadId: `workload-b-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Total should be 7
      const totalCount = governor.getContributorTotalAssignments('contributor-1');
      expect(totalCount).toBe(7);

      // Should still have room (cap is 10)
      const assignment = governor.createAssignment({
        orgId: 'org-a',
        contributorId: 'contributor-1',
        workloadId: 'workload-a-extra',
      });
      
      const result = governor.assignWorkload(assignment);
      expect(result.success).toBe(true);
      
      const newTotal = governor.getContributorTotalAssignments('contributor-1');
      expect(newTotal).toBe(8);
    });
  });

  describe('Cross-Org Assignment Completion', () => {
    it('should not affect org B counts when completing assignments in org A', () => {
      // Add assignments in both orgs
      const assignmentA = governor.createAssignment({
        orgId: 'org-a',
        contributorId: 'contributor-1',
        workloadId: 'workload-a-1',
      });
      governor.assignWorkload(assignmentA);

      const assignmentB = governor.createAssignment({
        orgId: 'org-b',
        contributorId: 'contributor-1',
        workloadId: 'workload-b-1',
      });
      governor.assignWorkload(assignmentB);

      // Verify initial counts
      let orgACount = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      let orgBCount = governor.getContributorAssignmentCount('contributor-1', 'org-b');
      expect(orgACount).toBe(1);
      expect(orgBCount).toBe(1);

      // Complete assignment in org A
      governor.completeAssignment('workload-a-1');

      // Verify org A count decreased, org B unchanged
      orgACount = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      orgBCount = governor.getContributorAssignmentCount('contributor-1', 'org-b');
      expect(orgACount).toBe(0);
      expect(orgBCount).toBe(1);

      // Total count should reflect only org B
      const totalCount = governor.getContributorTotalAssignments('contributor-1');
      expect(totalCount).toBe(1);
    });

    it('should allow new assignments in org A after completing old ones', () => {
      // Fill org A cap
      for (let i = 0; i < 5; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-a',
          contributorId: 'contributor-1',
          workloadId: `workload-a-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Verify at cap
      let orgACount = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      expect(orgACount).toBe(5);

      // Complete one assignment
      governor.completeAssignment('workload-a-0');

      // Now should have room
      orgACount = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      expect(orgACount).toBe(4);

      // Can add new assignment
      const newAssignment = governor.createAssignment({
        orgId: 'org-a',
        contributorId: 'contributor-1',
        workloadId: 'workload-a-new',
      });
      const result = governor.assignWorkload(newAssignment);
      expect(result.success).toBe(true);
    });
  });

  describe('Cross-Org Maintainer Restrictions', () => {
    it('should not allow maintainer in org A to act in org B', () => {
      // Set contributor as maintainer in org A
      governor.setMaintainer('org-a', 'contributor-1');

      // Verify is maintainer in org A
      expect(governor.isMaintainer('org-a', 'contributor-1')).toBe(true);
      
      // Verify is NOT maintainer in org B
      expect(governor.isMaintainer('org-b', 'contributor-1')).toBe(false);

      // Try to perform maintainer action in org B
      const result = governor.performMaintainerAction({
        orgId: 'org-b',
        maintainerId: 'contributor-1',
        action: 'approve_workload',
        workloadId: 'workload-b-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not maintainer');
    });

    it('should allow maintainer actions only in their org', () => {
      // Set contributor as maintainer in org A
      governor.setMaintainer('org-a', 'contributor-1');

      // Should allow actions in org A
      const resultA = governor.performMaintainerAction({
        orgId: 'org-a',
        maintainerId: 'contributor-1',
        action: 'approve_workload',
        workloadId: 'workload-a-1',
      });
      expect(resultA.success).toBe(true);

      // Should not allow actions in org B
      const resultB = governor.performMaintainerAction({
        orgId: 'org-b',
        maintainerId: 'contributor-1',
        action: 'approve_workload',
        workloadId: 'workload-b-1',
      });
      expect(resultB.success).toBe(false);
    });

    it('should enforce maintainer restrictions across multiple orgs', () => {
      // Set contributor as maintainer in both orgs
      governor.setMaintainer('org-a', 'contributor-1');
      governor.setMaintainer('org-b', 'contributor-1');

      // Should be maintainer in both
      expect(governor.isMaintainer('org-a', 'contributor-1')).toBe(true);
      expect(governor.isMaintainer('org-b', 'contributor-1')).toBe(true);

      // Should allow actions in both
      const resultA = governor.performMaintainerAction({
        orgId: 'org-a',
        maintainerId: 'contributor-1',
        action: 'approve_workload',
        workloadId: 'workload-a-1',
      });
      expect(resultA.success).toBe(true);

      const resultB = governor.performMaintainerAction({
        orgId: 'org-b',
        maintainerId: 'contributor-1',
        action: 'approve_workload',
        workloadId: 'workload-b-1',
      });
      expect(resultB.success).toBe(true);
    });

    it('should handle removing maintainer status correctly', () => {
      // Set as maintainer in org A
      governor.setMaintainer('org-a', 'contributor-1');
      expect(governor.isMaintainer('org-a', 'contributor-1')).toBe(true);

      // Remove maintainer status
      governor.removeMaintainer('org-a', 'contributor-1');
      expect(governor.isMaintainer('org-a', 'contributor-1')).toBe(false);

      // Should not allow actions
      const result = governor.performMaintainerAction({
        orgId: 'org-a',
        maintainerId: 'contributor-1',
        action: 'approve_workload',
        workloadId: 'workload-a-1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle contributor with no assignments correctly', () => {
      const countA = governor.getContributorAssignmentCount('contributor-1', 'org-a');
      const countB = governor.getContributorAssignmentCount('contributor-1', 'org-b');
      const total = governor.getContributorTotalAssignments('contributor-1');

      expect(countA).toBe(0);
      expect(countB).toBe(0);
      expect(total).toBe(0);
    });

    it('should handle non-existent orgs correctly', () => {
      const result = governor.getContributorAssignmentCount('contributor-1', 'org-non-existent');
      expect(result).toBe(0);
    });

    it('should handle non-existent contributors correctly', () => {
      const result = governor.getContributorAssignmentCount('contributor-non-existent', 'org-a');
      expect(result).toBe(0);
    });

    it('should maintain isolation when org caps change', () => {
      // Set different caps
      governor.setOrgCap('org-a', 3);
      governor.setOrgCap('org-b', 5);

      // Fill org A cap
      for (let i = 0; i < 3; i++) {
        const assignment = governor.createAssignment({
          orgId: 'org-a',
          contributorId: 'contributor-1',
          workloadId: `workload-a-${i}`,
        });
        governor.assignWorkload(assignment);
      }

      // Try to add more to org A (should fail)
      const assignmentA = governor.createAssignment({
        orgId: 'org-a',
        contributorId: 'contributor-1',
        workloadId: 'workload-a-extra',
      });
      const resultA = governor.assignWorkload(assignmentA);
      expect(resultA.success).toBe(false);

      // Should still be able to add to org B
      const assignmentB = governor.createAssignment({
        orgId: 'org-b',
        contributorId: 'contributor-1',
        workloadId: 'workload-b-1',
      });
      const resultB = governor.assignWorkload(assignmentB);
      expect(resultB.success).toBe(true);
    });
  });
});
