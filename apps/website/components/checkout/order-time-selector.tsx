'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export type OrderTime = { kind: 'asap' } | { kind: 'scheduled'; at: string };

interface OrderTimeSelectorProps {
  value: OrderTime;
  onChange: (value: OrderTime) => void;
}

export function OrderTimeSelector({ value, onChange }: OrderTimeSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={value.kind}
        onValueChange={(next) => {
          if (next === 'asap') {
            onChange({ kind: 'asap' });
          } else {
            onChange({ kind: 'scheduled', at: value.kind === 'scheduled' ? value.at : '' });
          }
        }}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="asap" id="order-time-asap" />
          <Label htmlFor="order-time-asap">As soon as possible</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="scheduled" id="order-time-scheduled" />
          <Label htmlFor="order-time-scheduled">Schedule for later</Label>
        </div>
      </RadioGroup>

      {value.kind === 'scheduled' ? (
        <Input
          type="datetime-local"
          aria-label="Scheduled time"
          value={value.at}
          onChange={(e) => {
            onChange({ kind: 'scheduled', at: e.target.value });
          }}
        />
      ) : null}
    </div>
  );
}
