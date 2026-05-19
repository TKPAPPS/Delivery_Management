'use client';

import { useEffect, useId, useState } from 'react';

interface DestinationInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function DestinationInput({
  label,
  value,
  onChange,
  placeholder = 'e.g. Bangkok Warehouse A',
  required,
  className,
}: DestinationInputProps) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/destinations')
      .then((r) => r.json())
      .then((d) => setOptions((d.destinations ?? []).map((dest: { name: string }) => dest.name)))
      .catch(() => {});
  }, []);

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
      />
      <datalist id={listId}>
        {options.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
