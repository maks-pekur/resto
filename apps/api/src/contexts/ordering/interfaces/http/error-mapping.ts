import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DuplicateOrderKeyError,
  InvalidOrderTransitionError,
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
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
  if (err instanceof OrderItemNotOrderableError) {
    return new UnprocessableEntityException({
      code: 'ordering.item_not_orderable',
      message: err.message,
    });
  }
  if (err instanceof OrderModifierNotAvailableError) {
    return new UnprocessableEntityException({
      code: 'ordering.modifier_not_available',
      message: err.message,
    });
  }
  if (err instanceof InvalidOrderTransitionError) {
    return new ConflictException({ code: 'ordering.invalid_transition', message: err.message });
  }
  return err;
};
