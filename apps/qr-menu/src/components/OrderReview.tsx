import { useState } from 'react';
import { submitOrderFeedback } from '../api/client';
import { t } from '../i18n';

const RATINGS = [1, 2, 3, 4, 5] as const;

export interface OrderReviewProps {
  readonly orderId: string;
  readonly onSubmitted: () => void;
}

/**
 * Asked once, at the table, after the order was served — and asked of everyone the same way.
 * Nothing here routes a low score somewhere quieter than a high one.
 */
export const OrderReview = ({ orderId, onSubmitted }: OrderReviewProps) => {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = (): void => {
    if (rating === null) return;
    setPending(true);
    setFailed(false);
    void submitOrderFeedback(orderId, { rating, comment: comment.trim() || null })
      .then((ok) => {
        setPending(false);
        if (ok) onSubmitted();
        else setFailed(true);
      })
      .catch(() => {
        setPending(false);
        setFailed(true);
      });
  };

  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <p className="text-base font-extrabold">{t('review.title')}</p>

      <div role="radiogroup" aria-label={t('review.title')} className="flex justify-between gap-2">
        {RATINGS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={t(`review.rating.${value}`)}
            data-testid={`review-rating-${value}`}
            onClick={() => {
              setRating(value);
            }}
            className={`focus-visible:ring-ring flex h-14 flex-1 cursor-pointer items-center justify-center rounded-xl text-2xl transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              rating === value ? 'bg-primary-tint ring-primary ring-2' : 'bg-muted'
            }`}
          >
            {['🙁', '😕', '🙂', '😃', '🤩'][value - 1]}
          </button>
        ))}
      </div>

      {rating === null ? null : (
        <>
          <textarea
            value={comment}
            maxLength={2000}
            rows={3}
            placeholder={t('review.commentPlaceholder')}
            onChange={(event) => {
              setComment(event.target.value);
            }}
            className="border-input focus-visible:ring-ring rounded-xl border px-3 py-2 text-base focus-visible:ring-2 focus-visible:outline-none"
          />
          <button
            type="button"
            disabled={pending}
            onClick={send}
            className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            {pending ? t('review.sending') : t('review.send')}
          </button>
        </>
      )}

      {failed ? <p className="text-destructive text-sm">{t('review.failed')}</p> : null}
    </section>
  );
};
