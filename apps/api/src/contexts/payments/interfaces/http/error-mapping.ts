import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  CurrencyMismatchError,
  OrderNotCheckoutableError,
  PaymentsNotEnabledError,
  RefundReasonRequiredError,
  PaymentNotRefundableError,
} from '../../domain/errors';
import { OrderNotFoundError, RefundExceedsCapturedError } from '../../../ordering/domain/errors';

export const mapPaymentError = (err: unknown): unknown => {
  if (err instanceof PaymentsNotEnabledError) {
    return new ConflictException({ code: 'payments.not_enabled', message: err.message });
  }
  if (err instanceof CurrencyMismatchError) {
    return new UnprocessableEntityException({
      code: 'payments.currency_mismatch',
      message: err.message,
    });
  }
  if (err instanceof OrderNotCheckoutableError) {
    return new ConflictException({ code: 'payments.order_not_checkoutable', message: err.message });
  }
  if (err instanceof OrderNotFoundError) {
    return new NotFoundException({ code: 'ordering.order_not_found', message: err.message });
  }
  if (err instanceof RefundReasonRequiredError) {
    return new UnprocessableEntityException({
      code: 'payments.refund_reason_required',
      message: err.message,
    });
  }
  if (err instanceof RefundExceedsCapturedError) {
    return new ConflictException({
      code: 'payments.refund_exceeds_captured',
      message: err.message,
    });
  }
  if (err instanceof PaymentNotRefundableError) {
    return new ConflictException({
      code: 'payments.not_refundable',
      message: err.message,
    });
  }
  return err;
};
