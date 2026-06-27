import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { getOrderStatus } from '@/lib/checkout-api';
import { OrderStatusPoller } from '@/components/checkout/order-status-poller';

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false },
};

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function ConfirmationPage({ params }: Props) {
  const { orderId } = await params;
  const h = await headers();
  const host = h.get('host') ?? '';

  let initialStatus;
  try {
    initialStatus = await getOrderStatus(orderId, undefined, host);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-[24px] font-semibold leading-[1.25]">Order confirmation</h1>
      <OrderStatusPoller orderId={orderId} initialStatus={initialStatus} />
    </main>
  );
}
