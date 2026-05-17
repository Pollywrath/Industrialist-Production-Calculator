import React, { useState, useRef, useEffect } from 'react';
import styles from './SearchDropdown.module.css';

interface Option {
  value: string;
  label: string;
}

interface SearchDropdownProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
}: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Click outside listener to reset values and dismiss dropdown panel
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Determine active input text dynamically to avoid redundant useEffect state syncs
  const inputValue = isFocused ? typedValue : (selectedOption ? selectedOption.label : '');

  // Filter options based on the typed value
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(typedValue.toLowerCase())
  );

  const handleFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setIsFocused(true);
    // Initialize query to selected label for editing
    setTypedValue(selectedOption ? selectedOption.label : '');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedValue(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className={styles['dropdown-container']} ref={containerRef}>
      <div className={styles['dropdown-input-wrapper']}>
        <input
          ref={inputRef}
          type="text"
          className={`${styles['dropdown-input']} ${disabled ? styles['is-disabled'] : ''}`}
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          disabled={disabled}
        />
        <span className={styles['input-arrow']}>▼</span>
      </div>

      {isOpen && (
        <div className={styles['dropdown-panel']}>
          <div className={styles['options-list']}>
            {filteredOptions.length === 0 ? (
              <div className={styles['no-options']}>No options found</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles['option-item']} ${opt.value === value ? styles['is-selected'] : ''}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
