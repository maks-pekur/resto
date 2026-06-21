export class OrderNotFoundError extends Error {
  readonly kind = 'OrderNotFoundError' as const;
  constructor(public readonly orderId: string) {
    super(`Order "${orderId}" was not found.`);
    this.name = 'OrderNotFoundError';
  }
}

export class DuplicateOrderKeyError extends Error {
  readonly kind = 'DuplicateOrderKeyError' as const;
  constructor(public readonly idempotencyKey: string) {
    super(`Order with idempotency key "${idempotencyKey}" already exists.`);
    this.name = 'DuplicateOrderKeyError';
  }
}

export class InvalidOrderTransitionError extends Error {
  readonly kind = 'InvalidOrderTransitionError' as const;
  constructor(
    public readonly orderId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot transition order "${orderId}" from "${from}" to "${to}".`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export class OrderItemUnavailableError extends Error {
  readonly kind = 'OrderItemUnavailableError' as const;
  constructor(public readonly itemId: string) {
    super(`Menu item "${itemId}" is on the stop-list and cannot be ordered.`);
    this.name = 'OrderItemUnavailableError';
  }
}

export class OrderItemNotOrderableError extends Error {
  readonly kind = 'OrderItemNotOrderableError' as const;
  constructor(public readonly itemId: string) {
    super(`Menu item "${itemId}" is not available for ordering.`);
    this.name = 'OrderItemNotOrderableError';
  }
}

export class OrderModifierNotAvailableError extends Error {
  readonly kind = 'OrderModifierNotAvailableError' as const;
  constructor(public readonly optionId: string) {
    super(`Modifier option "${optionId}" is not available for this item.`);
    this.name = 'OrderModifierNotAvailableError';
  }
}

export type OrderDomainError =
  | OrderNotFoundError
  | DuplicateOrderKeyError
  | InvalidOrderTransitionError
  | OrderItemUnavailableError
  | OrderItemNotOrderableError
  | OrderModifierNotAvailableError;
