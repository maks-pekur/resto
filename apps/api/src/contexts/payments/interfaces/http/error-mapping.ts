import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import {
  CurrencyMismatchError,
  OrderNotCheckoutableError,
  PaymentsNotEnabledError,
} from '../../domain/errors';
import { OrderNotFoundError } from '../../../ordering/domain/errors';

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
    return new ConflictException({ code: 'ordering.order_not_found', message: err.message });
  }
  return err;
};
