import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { NoLocationForTenantError } from '../../../catalog/domain/errors';
import {
  DuplicateOrderKeyError,
  InvalidCancelReasonError,
  InvalidOrderTransitionError,
  InvalidPrepMinutesError,
  OrderIngredientUnavailableError,
  OrderItemNotOrderableError,
  OrderItemUnavailableError,
  OrderModifierNotAvailableError,
  OrderModifierSelectionInvalidError,
  OrderFeedbackAlreadyLeftError,
  OrderFeedbackNotYoursError,
  OrderNotFoundError,
  OrderNotServedYetError,
  OrderTableNotResolvedError,
} from '../../domain/errors';

export const mapOrderError = (err: unknown): unknown => {
  if (err instanceof NoLocationForTenantError) {
    return new NotFoundException({ code: 'catalog.no_location_for_tenant', message: err.message });
  }
  if (err instanceof OrderFeedbackNotYoursError) {
    // Deliberately a 404: a guest at another table learns nothing about this order's existence.
    return new NotFoundException({ code: 'ordering.order_not_found', message: err.message });
  }
  if (err instanceof OrderNotServedYetError) {
    return new ConflictException({ code: 'ordering.order_not_served_yet', message: err.message });
  }
  if (err instanceof OrderFeedbackAlreadyLeftError) {
    return new ConflictException({ code: 'ordering.feedback_already_left', message: err.message });
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
  if (err instanceof OrderIngredientUnavailableError) {
    return new UnprocessableEntityException({
      code: 'ordering.modifier_unavailable',
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
  if (err instanceof InvalidPrepMinutesError) {
    return new BadRequestException({ code: 'ordering.invalid_prep_minutes', message: err.message });
  }
  if (err instanceof InvalidCancelReasonError) {
    return new BadRequestException({
      code: 'ordering.invalid_cancel_reason',
      message: err.message,
    });
  }
  if (err instanceof OrderTableNotResolvedError) {
    return new BadRequestException({
      code: 'ordering.table_not_resolved',
      message: err.message,
    });
  }
  return err;
};
