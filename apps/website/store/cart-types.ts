export interface CartModifier {
  readonly optionId: string;
  readonly name: string;
  readonly priceDelta: string;
  readonly amount: number;
}

export interface CartLineItem {
  readonly itemId: string;
  readonly sizeId: string | null;
  readonly name: string;
  readonly unitPrice: string;
  readonly currency: string;
  readonly modifiers: readonly CartModifier[];
  quantity: number;
}
