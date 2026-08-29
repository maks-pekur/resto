'use client';

import { useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { Input } from '@resto/ui';
import { Badge } from '@resto/ui';

type ZoneState = 'idle' | 'valid' | 'out-of-zone';

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export function AddressInput({ value, onChange, onBlur }: AddressInputProps) {
  const [zone, setZone] = useState<ZoneState>('idle');

  const handleBlur = () => {
    setZone(value.trim().length > 0 ? 'valid' : 'idle');
    onBlur?.();
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="text"
        placeholder="Enter your delivery address"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={handleBlur}
        aria-label="Delivery address"
      />
      {zone === 'valid' ? (
        <Badge className="w-fit gap-1 bg-primary-tint text-primary-strong">
          <Check className="h-3 w-3" /> We deliver to this area
        </Badge>
      ) : null}
      {zone === 'out-of-zone' ? (
        <Badge className="w-fit gap-1 bg-amber-100 text-amber-700">
          <TriangleAlert className="h-3 w-3" /> We don&apos;t deliver to this address yet. Try
          pickup instead.
        </Badge>
      ) : null}
    </div>
  );
}
