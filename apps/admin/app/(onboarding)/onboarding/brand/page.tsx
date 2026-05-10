import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandForm } from './brand-form-client';

export default function NewBrandPage() {
  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your first brand</CardTitle>
          <CardDescription>
            Brands are the customer-facing identity inside your operator account. You can add more
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandForm />
        </CardContent>
      </Card>
    </div>
  );
}
