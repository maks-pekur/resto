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
