import { Inject, Injectable } from '@nestjs/common';
import { TABLE_ZONE_REPOSITORY, type TableZoneRepository } from '../domain/ports';
import { RestaurantTableNotFoundError } from '../domain/errors';

/** A meal, not a day: long enough to order a second round, short enough that a copied cookie
 * stops working before the next guests sit down. */
export const TABLE_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export interface OpenedTableSession {
  readonly sessionId: string;
  readonly tableId: string;
  readonly zoneName: string;
  readonly number: string;
  readonly expiresAt: Date;
}

export interface ResolvedTableSession {
  readonly tableId: string;
  readonly locationId: string;
  readonly zoneName: string;
  readonly number: string;
}

@Injectable()
export class TableSessionService {
  constructor(@Inject(TABLE_ZONE_REPOSITORY) private readonly repo: TableZoneRepository) {}

  /** Exchange the secret printed on the table for a session nobody can forge from a URL. */
  async open(qrToken: string, now: Date = new Date()): Promise<OpenedTableSession> {
    const table = await this.repo.findActiveTableByQrToken(qrToken);
    if (!table) throw new RestaurantTableNotFoundError(qrToken);

    const expiresAt = new Date(now.getTime() + TABLE_SESSION_TTL_MS);
    const sessionId = await this.repo.openTableSession({
      tableId: table.tableId,
      locationId: table.locationId,
      expiresAt,
    });

    return {
      sessionId,
      tableId: table.tableId,
      zoneName: table.zoneName,
      number: table.number,
      expiresAt,
    };
  }

  async resolve(sessionId: string): Promise<ResolvedTableSession | null> {
    const table = await this.repo.findLiveTableSession(sessionId);
    if (!table) return null;
    return {
      tableId: table.tableId,
      locationId: table.locationId,
      zoneName: table.zoneName,
      number: table.number,
    };
  }
}
