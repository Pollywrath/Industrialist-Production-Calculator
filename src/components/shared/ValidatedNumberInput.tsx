import { useState } from 'react';
import type { ChangeEvent } from 'react';

interface ValidatedNumberInputProps {
  value: number | undefined;
  onChange: (value: number) => void;
  defaultValue: number;
  allowDecimals?: boolean;
  allowNegatives?: boolean;
  min?: number;
  max?: number;
  step?: string | number;
  placeholder?: string;
  className?: string;
  title?: string;
}

export function ValidatedNumberInput({
  value,
  onChange,
  defaultValue,
  allowDecimals = true,
  allowNegatives = true,
  min,
  max,
  step = 'any',
  placeholder,
  className,
  title,
}: ValidatedNumberInputProps) {
  const [prevValue, setPrevValue] = useState<number | undefined>(value);
  const [localVal, setLocalVal] = useState<string>(
    value === undefined || value === null ? '' : value.toString()
  );

  if (value !== prevValue) {
    setPrevValue(value);
    setLocalVal(value === undefined || value === null ? '' : value.toString());
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;

    // Filter characters early
    if (!allowNegatives && valStr.startsWith('-')) {
      return;
    }
    if (!allowDecimals && valStr.includes('.')) {
      return;
    }

    setLocalVal(valStr);

    const parsed = allowDecimals ? parseFloat(valStr) : parseInt(valStr, 10);
    if (!isNaN(parsed) && !valStr.endsWith('.') && valStr !== '-') {
      let committed = parsed;
      if (min !== undefined) committed = Math.max(min, committed);
      if (max !== undefined) committed = Math.min(max, committed);
      onChange(committed);
    }
  };

  const handleBlur = () => {
    const parsed = allowDecimals ? parseFloat(localVal) : parseInt(localVal, 10);
    let committed = isNaN(parsed) ? defaultValue : parsed;

    if (min !== undefined) committed = Math.max(min, committed);
    if (max !== undefined) committed = Math.min(max, committed);

    setLocalVal(committed.toString());
    onChange(committed);
  };

  return (
    <input
      type="number"
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={className}
      title={title}
    />
  );
}
