import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchOrderStatus } from '@/lib/api-client';
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

  let initialStatus;
  try {
    initialStatus = await fetchOrderStatus(orderId);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-extrabold">Order confirmation</h1>
      <OrderStatusPoller orderId={orderId} initialStatus={initialStatus} />
    </main>
  );
}
