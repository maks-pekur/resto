import type { Metadata } from 'next';
import { ContentRouteServer, contentMetadata } from '@/components/content-route';

export async function generateMetadata(): Promise<Metadata> {
  return contentMetadata('FAQ');
}

export default function FaqPage() {
  return <ContentRouteServer pageKey="faq" />;
}
