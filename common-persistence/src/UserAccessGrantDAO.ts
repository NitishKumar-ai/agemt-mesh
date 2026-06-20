export interface UserAccessGrant {
  id?: number;
  tenantId: string;
  userId: string;
  permissionHash: string;
  isAdmin: boolean;
  createdAt?: number;
}

export interface UserAccessGrantDAO {
  saveUserAccessGrant(grant: UserAccessGrant): Promise<UserAccessGrant>;
  getUserAccessGrants(tenantId: string, userId: string): Promise<UserAccessGrant[]>;
}
