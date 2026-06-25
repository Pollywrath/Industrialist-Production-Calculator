import React, { useState, useRef, useEffect } from 'react';
import styles from './SearchDropdown.module.css';
import { isTutorialActive } from '../../stores/useTutorialStore';
import { TUTORIAL_DRIVER_REFRESH_EVENT } from '../tutorial/tutorialHighlightUtils';

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
  dataTutorialDataField?: string;
}

export function SearchDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  dataTutorialDataField,
}: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [typedValue, setTypedValue] = useState('');
  const [hasTyped, setHasTyped] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTutorialActive() || !isOpen || !containerRef.current) return;

    const container = containerRef.current;
    const originalGetBoundingClientRect = container.getBoundingClientRect;

    container.getBoundingClientRect = function (this: HTMLDivElement) {
      const rect = originalGetBoundingClientRect.call(container);
      if (panelRef.current) {
        const panelRect = panelRef.current.getBoundingClientRect();
        const top = Math.min(rect.top, panelRect.top);
        const left = Math.min(rect.left, panelRect.left);
        const right = Math.max(rect.right, panelRect.right);
        const bottom = Math.max(rect.bottom, panelRect.bottom);
        return new DOMRect(left, top, right - left, bottom - top);
      }
      return rect;
    };

    window.dispatchEvent(new Event(TUTORIAL_DRIVER_REFRESH_EVENT));

    return () => {
      container.getBoundingClientRect = originalGetBoundingClientRect;
      window.dispatchEvent(new Event(TUTORIAL_DRIVER_REFRESH_EVENT));
    };
  }, [isOpen, typedValue]);

  const selectedOption = options.find((opt) => opt.value === value);

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

  const inputValue = isFocused ? typedValue : selectedOption ? selectedOption.label : '';

  const filteredOptions = hasTyped
    ? options.filter((opt) =>
      opt.label.toLowerCase().includes(typedValue.toLowerCase()),
    )
    : options;

  const handleFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    setIsFocused(true);
    setTypedValue(selectedOption ? selectedOption.label : '');
    setHasTyped(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedValue(e.target.value);
    setHasTyped(true);
    setIsOpen(true);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div
      className={styles['dropdown-container']}
      ref={containerRef}
      data-tutorial-data-field={dataTutorialDataField}
    >
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
          data-tutorial-data-field={dataTutorialDataField}
        />
        <span className={styles['input-arrow']}>▼</span>
      </div>

      {isOpen && (
        <div ref={panelRef} className={styles['dropdown-panel']}>
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
                  data-tutorial-data-option={dataTutorialDataField ? `${dataTutorialDataField}:${opt.value}` : undefined}
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
