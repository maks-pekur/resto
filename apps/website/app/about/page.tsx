import type { Metadata } from 'next';
import { ContentRouteServer, contentMetadata } from '@/components/content-route';

export async function generateMetadata(): Promise<Metadata> {
  return contentMetadata('About');
}

export default function AboutPage() {
  return <ContentRouteServer pageKey="about" />;
}
