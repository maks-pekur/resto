import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DuplicateOrderKeyError,
  InvalidOrderTransitionError,
  OrderItemUnavailableError,
  OrderNotFoundError,
} from '../../domain/errors';

export const mapOrderError = (err: unknown): unknown => {
  if (err instanceof OrderNotFoundError) {
    return new NotFoundException({ code: 'ordering.order_not_found', message: err.message });
  }
  if (err instanceof DuplicateOrderKeyError) {
    return new ConflictException({
      code: 'ordering.duplicate_idempotency_key',
      message: err.message,
    });
  }
  if (err instanceof OrderItemUnavailableError) {
    return new UnprocessableEntityException({
      code: 'ordering.item_unavailable',
      message: err.message,
    });
  }
  if (err instanceof InvalidOrderTransitionError) {
    return new ConflictException({ code: 'ordering.invalid_transition', message: err.message });
  }
  return err;
};
