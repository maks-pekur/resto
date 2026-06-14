export interface BaUserRecord {
  readonly id: string;
  readonly email: string;
}

export interface BaUserReader {
  findUserByEmail(email: string): Promise<BaUserRecord | null>;
  findOwnerByOrganization(organizationId: string): Promise<BaUserRecord | null>;
}

export const BA_USER_READER = Symbol('BA_USER_READER');
