import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyBrands } from '@/lib/me-brands';
import { BrandForm } from './brand-form-client';

export default async function NewBrandPage() {
  const res = await getMyBrands();
  const isFirstBrand = !res.ok || !res.data || res.data.brands.length === 0;
  const title = isFirstBrand ? 'Create your first brand' : 'Add a brand';
  const description = isFirstBrand
    ? 'Brands are the customer-facing identity inside your operator account. You can add more later.'
    : 'Add another customer-facing brand under this operator account.';

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          {!isFirstBrand && (
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Link>
          )}
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandForm />
        </CardContent>
      </Card>
    </div>
  );
}
