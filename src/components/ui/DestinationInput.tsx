'use client';

import { useEffect, useState } from 'react';

let _cache: string[] | null = null;
async function fetchDestinations(): Promise<string[]> {
  if (_cache) return _cache;
  const r = await fetch('/api/destinations');
  const d = await r.json();
  _cache = (d.destinations ?? []).map((dest: { name: string }) => dest.name);
  return _cache!;
}

interface DestinationInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

export default function DestinationInput({ label, value, onChange, required, className }: DestinationInputProps) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    fetchDestinations().then(setOptions).catch(() => {});
  }, []);

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crimson-500 bg-white"
      >
        <option value="">— select destination —</option>
        {options.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
  );
}
