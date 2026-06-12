import type { Metadata } from 'next';
import { ContentRouteServer, contentMetadata } from '@/components/content-route';

export async function generateMetadata(): Promise<Metadata> {
  return contentMetadata('Contact');
}

export default function ContactPage() {
  return <ContentRouteServer pageKey="contact" />;
}
