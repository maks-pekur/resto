import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { NoLocationForBrandError } from '../../../catalog/domain/errors';
import {
  DuplicateOrderKeyError,
  InvalidOrderTransitionError,
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
  OrderModifierSelectionInvalidError,
  OrderNotFoundError,
} from '../../domain/errors';

export const mapOrderError = (err: unknown): unknown => {
  if (err instanceof NoLocationForBrandError) {
    return new NotFoundException({ code: 'catalog.no_location_for_brand', message: err.message });
  }
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
  if (err instanceof OrderModifierSelectionInvalidError) {
    return new UnprocessableEntityException({
      code: 'ordering.modifier_selection_invalid',
      message: err.message,
    });
  }
  if (err instanceof InvalidOrderTransitionError) {
    return new ConflictException({ code: 'ordering.invalid_transition', message: err.message });
  }
  return err;
};
