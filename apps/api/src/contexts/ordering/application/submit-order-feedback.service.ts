import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { OrderId } from '@resto/domain';
import {
  ORDER_FEEDBACK_REPOSITORY,
  ORDER_REPOSITORY,
  type OrderFeedback,
  type OrderFeedbackRepository,
  type OrderRepository,
} from '../domain/ports';
import {
  OrderFeedbackAlreadyLeftError,
  OrderFeedbackNotYoursError,
  OrderNotFoundError,
  OrderNotServedYetError,
} from '../domain/errors';

export interface SubmitOrderFeedbackInput {
  readonly orderId: string;
  readonly rating: number;
  readonly comment: string | null;
}

/**
 * The order is the proof, not an account: a guest who ordered here may say what they thought,
 * once, after it was served. Asking them to sign in first would cost most of the answers.
 */
@Injectable()
export class SubmitOrderFeedbackService {
  private readonly logger = new Logger(SubmitOrderFeedbackService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_FEEDBACK_REPOSITORY) private readonly feedback: OrderFeedbackRepository,
  ) {}

  async execute(
    input: SubmitOrderFeedbackInput,
    tableId: string | undefined,
  ): Promise<OrderFeedback> {
    const ctx = requireTenantContext();
    const order = await this.orders.findById(OrderId.parse(input.orderId));
    if (!order) throw new OrderNotFoundError(input.orderId);

    const snapshot = order.toSnapshot();
    if (snapshot.tableId === null || snapshot.tableId !== tableId) {
      throw new OrderFeedbackNotYoursError(input.orderId);
    }
    if (snapshot.status !== 'completed') throw new OrderNotServedYetError(input.orderId);
    if (await this.feedback.findByOrderId(input.orderId)) {
      throw new OrderFeedbackAlreadyLeftError(input.orderId);
    }

    const saved = await this.feedback.submit({
      tenantId: ctx.tenantId,
      orderId: input.orderId,
      locationId: snapshot.locationId,
      rating: input.rating,
      comment: input.comment,
    });
    this.logger.log({ orderId: input.orderId, rating: input.rating }, 'Order feedback left.');
    return saved;
  }
}
