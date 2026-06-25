import { useRef, useEffect } from 'react';
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
  disabled?: boolean;
  dataTutorialDataField?: string;
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
  disabled = false,
  dataTutorialDataField,
}: ValidatedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value === undefined || value === null ? '' : value.toString();
    }
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;

    if (!allowNegatives && valStr.startsWith('-')) {
      if (inputRef.current) {
        inputRef.current.value = valStr.replace('-', '');
      }
      return;
    }
    if (!allowDecimals && valStr.includes('.')) {
      if (inputRef.current) {
        inputRef.current.value = valStr.replace('.', '');
      }
      return;
    }

    const parsed = allowDecimals ? parseFloat(valStr) : parseInt(valStr, 10);
    if (!isNaN(parsed) && !valStr.endsWith('.') && valStr !== '-') {
      let committed = parsed;
      if (min !== undefined) committed = Math.max(min, committed);
      if (max !== undefined) committed = Math.min(max, committed);
      
      if (step !== undefined && step !== 'any') {
        const stepNum = typeof step === 'number' ? step : parseFloat(step);
        if (!isNaN(stepNum) && stepNum > 0) {
          committed = Math.round(committed / stepNum) * stepNum;
        }
      }
      
      onChange(committed);
    }
  };

  const handleBlur = () => {
    const currentValStr = inputRef.current?.value || '';
    const parsed = allowDecimals ? parseFloat(currentValStr) : parseInt(currentValStr, 10);
    let committed = isNaN(parsed) ? defaultValue : parsed;

    if (min !== undefined) committed = Math.max(min, committed);
    if (max !== undefined) committed = Math.min(max, committed);

    if (step !== undefined && step !== 'any') {
      const stepNum = typeof step === 'number' ? step : parseFloat(step);
      if (!isNaN(stepNum) && stepNum > 0) {
        committed = Math.round(committed / stepNum) * stepNum;
      }
    }

    if (inputRef.current) {
      inputRef.current.value = committed.toString();
    }
    onChange(committed);
  };

  return (
    <input
      ref={inputRef}
      type="number"
      defaultValue={value === undefined || value === null ? '' : value.toString()}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={className}
      title={title}
      disabled={disabled}
      data-tutorial-data-field={dataTutorialDataField}
    />
  );
}
