export class PaymentsNotEnabledError extends Error {
  readonly kind = 'PaymentsNotEnabledError' as const;
  constructor(public readonly tenantId: string) {
    super(`Tenant "${tenantId}" cannot accept payments — KYC not complete.`);
    this.name = 'PaymentsNotEnabledError';
  }
}

export class CurrencyMismatchError extends Error {
  readonly kind = 'CurrencyMismatchError' as const;
  constructor(
    public readonly orderCurrency: string,
    public readonly tenantCurrency: string,
  ) {
    super(
      `Order currency "${orderCurrency}" does not match tenant settlement currency "${tenantCurrency}".`,
    );
    this.name = 'CurrencyMismatchError';
  }
}

export class OrderNotCheckoutableError extends Error {
  readonly kind = 'OrderNotCheckoutableError' as const;
  constructor(
    public readonly orderId: string,
    public readonly status: string,
  ) {
    super(`Order "${orderId}" cannot be checked out — current status is "${status}".`);
    this.name = 'OrderNotCheckoutableError';
  }
}

export class RefundReasonRequiredError extends Error {
  readonly kind = 'RefundReasonRequiredError' as const;
  constructor(public readonly orderId: string) {
    super(`Refund reason is required for order "${orderId}".`);
    this.name = 'RefundReasonRequiredError';
  }
}

export class PaymentNotRefundableError extends Error {
  readonly kind = 'PaymentNotRefundableError' as const;
  constructor(public readonly orderId: string) {
    super(`No refundable payment found for order "${orderId}".`);
    this.name = 'PaymentNotRefundableError';
  }
}

export class RefundProviderFailedError extends Error {
  readonly kind = 'RefundProviderFailedError' as const;
  constructor(
    public readonly orderId: string,
    public readonly refundRequestId: string,
    public readonly amountMinor: number,
    public readonly providerMessage: string,
  ) {
    super(
      `Refund provider call failed for order "${orderId}" (request "${refundRequestId}"): ${providerMessage}`,
    );
    this.name = 'RefundProviderFailedError';
  }
}

export class RefundNotRetryableError extends Error {
  readonly kind = 'RefundNotRetryableError' as const;
  constructor(
    public readonly orderId: string,
    public readonly refundRequestId: string,
    public readonly currentStatus: string,
  ) {
    super(
      `Refund "${refundRequestId}" for order "${orderId}" is not retryable — current status is "${currentStatus}", expected "failed".`,
    );
    this.name = 'RefundNotRetryableError';
  }
}
