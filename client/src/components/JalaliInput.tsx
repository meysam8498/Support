import React, { useState, useEffect } from 'react';
import { normalizeJalali, todayJalali } from '../lib/date';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}

export default function JalaliInput({ label, value, onChange, required, className = '' }: Props) {
  const [raw, setRaw] = useState(value);
  const [valid, setValid] = useState(true);

  useEffect(() => { setRaw(value); }, [value]);

  const blur = () => {
    const norm = normalizeJalali(raw);
    if (raw && !norm) {
      setValid(false);
    } else {
      setValid(true);
      onChange(norm || '');
    }
  };

  const fillToday = () => {
    const t = todayJalali();
    setRaw(t);
    onChange(t);
    setValid(true);
  };

  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
        <button type="button" onClick={fillToday} className="mr-2 text-xs text-brand-600 hover:underline">
          امروز
        </button>
      </label>
      <input
        type="text"
        className={`input ${!valid ? 'border-red-500' : ''}`}
        placeholder="1403/05/15"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={blur}
        dir="ltr"
        style={{ textAlign: 'center' }}
        required={required}
      />
      {!valid && <p className="mt-1 text-xs text-red-500">تاریخ نامعتبر است.</p>}
    </div>
  );
}
