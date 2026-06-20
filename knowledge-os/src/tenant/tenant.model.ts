
export interface RegionProfile {
  dataResidency: string; // e.g., 'US', 'EU'
}

export interface PolicyProfile {
  retentionDays: number;
  allowedConnectors: string[];
}

export interface Tenant {
  id: string;
  name: string;
  regionProfile: RegionProfile;
  policyProfile: PolicyProfile;
}
