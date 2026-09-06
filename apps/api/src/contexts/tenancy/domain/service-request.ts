export type ServiceRequestKind = 'waiter' | 'bill';

export interface ServiceRequest {
  readonly id: string;
  readonly kind: ServiceRequestKind;
  readonly tableId: string;
  readonly locationId: string;
  readonly createdAt: Date;
}

/** What the floor sees: the call plus the table it came from. */
export interface ServiceRequestRow extends ServiceRequest {
  readonly zoneName: string;
  readonly tableNumber: string;
}

export interface ServiceRequestRepository {
  open(input: {
    readonly kind: ServiceRequestKind;
    readonly tableId: string;
    readonly locationId: string;
  }): Promise<ServiceRequest>;
  listOpen(): Promise<readonly ServiceRequestRow[]>;
  resolve(id: string): Promise<void>;
}

export const SERVICE_REQUEST_REPOSITORY = Symbol('SERVICE_REQUEST_REPOSITORY');
