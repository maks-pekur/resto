import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CurrencyMismatchError,
  OrderNotCheckoutableError,
  PaymentsNotEnabledError,
  RefundReasonRequiredError,
  PaymentNotRefundableError,
  RefundNotRetryableError,
  RefundProviderFailedError,
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
  if (err instanceof RefundNotRetryableError) {
    return new ConflictException({
      code: 'payments.refund_not_retryable',
      message: err.message,
    });
  }
  if (err instanceof RefundProviderFailedError) {
    return new BadGatewayException({
      code: 'payments.refund_provider_failed',
      message: err.message,
    });
  }
  return err;
};
