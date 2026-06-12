export type ContentPageKey = 'about' | 'delivery' | 'contact' | 'faq';

export interface SeededContent {
  readonly heading: string;
  readonly body: string;
}

export function getSeededContent(key: ContentPageKey, restaurantName: string): SeededContent {
  switch (key) {
    case 'about':
      return {
        heading: `About ${restaurantName}`,
        body: `Welcome to ${restaurantName}.\n\nWe serve fresh food made to order. Browse our menu and order online for delivery or pickup.`,
      };
    case 'delivery':
      return {
        heading: 'Delivery Information',
        body: `${restaurantName} offers both delivery and pickup.\n\nChoose your preferred option when you place your order. Delivery availability and timing are confirmed at checkout.`,
      };
    case 'contact':
      return {
        heading: 'Contact Us',
        body: `Have a question about your order? Reach out to ${restaurantName}.\n\nWe're happy to help with the menu, your order, and delivery.`,
      };
    case 'faq':
      return {
        heading: 'Frequently Asked Questions',
        body: `How do I place an order?\nBrowse the menu, add items to your cart, and proceed to checkout.\n\nDo you offer delivery and pickup?\nYes — pick your preferred option at checkout.`,
      };
  }
}
