export interface Issue {
  id: number;
  org_id: string;
  title: string;
  status: string;
}

export interface Counts {
  totalApplications: number;
  totalAssignments: number;
  byOrganization: Array<{ org_id: string; applications: number; assignments: number }>;
}
