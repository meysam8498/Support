import React from 'react';

interface Props {
  label: string;
  value: number | string | '';
  onChange: (v: number | string) => void;
  options: { id: number | string; name: string }[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function SelectField({ label, value, onChange, options, placeholder, required, className = '' }: Props) {
  return (
    <div className={className}>
      <label className="label">{label}{required && <span className="text-red-500 mr-1">*</span>}</label>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
        required={required}
      >
        <option value="">{placeholder || 'انتخاب کنید...'}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}