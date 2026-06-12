import type { Metadata } from 'next';
import { ContentRouteServer, contentMetadata } from '@/components/content-route';

export async function generateMetadata(): Promise<Metadata> {
  return contentMetadata('Delivery');
}

export default function DeliveryPage() {
  return <ContentRouteServer pageKey="delivery" />;
}
