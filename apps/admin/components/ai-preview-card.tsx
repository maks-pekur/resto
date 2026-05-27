import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AiPreviewCardClient } from './ai-preview-card-client';

/**
 * AI assistant preview card — CONTEXT D-17 (verbatim header + Q2 2027
 * launch caption + inline email capture). D-08 voice rule: calm, no
 * exclamation marks, 1-sentence value description. The header is
 * locked in Russian per CONTEXT D-17.
 */
export function AiPreviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          AI-помощник скоро будет
        </CardTitle>
        <CardDescription>
          Suggest promos, edit menu, generate reports, chat with guests on your behalf. Launching Q2
          2027.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiPreviewCardClient />
      </CardContent>
    </Card>
  );
}
