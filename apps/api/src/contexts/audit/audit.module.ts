import { Module } from '@nestjs/common';
import { NatsModule } from '../../infrastructure/nats.module';
import { RecordAuditService } from './application/record-audit.service';
import { NatsAuditSubscriber } from './infrastructure/nats-audit-subscriber';

@Module({
  imports: [NatsModule],
  providers: [RecordAuditService, NatsAuditSubscriber],
})
export class AuditModule {}
