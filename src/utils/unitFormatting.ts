import { toPlainString } from './precision';

function formatWithPrefix(
  value: number,
  conversionLimit: number,
  prefixes: string[],
  suffix: string,
  prefixUnit = '',
  decimals = 2,
): string {
  if (!Number.isFinite(value)) {
    return value < 0 ? `-${prefixUnit}∞` : `${prefixUnit}∞`;
  }
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  if (absValue < conversionLimit) {
    if (absValue >= 1000) {
      const parts = absValue.toFixed(decimals).split('.');
      const integerPart = parseInt(parts[0], 10).toLocaleString('en-US');
      const decimalValue = parseFloat('0.' + parts[1]);
      const decimalPart = decimalValue > 0 ? '.' + parts[1].replace(/0+$/, '') : '';
      const cleanDecimalPart = decimalPart === '.' ? '' : decimalPart;
      const formatted = `${prefixUnit}${integerPart}${cleanDecimalPart}${suffix}`;
      return isNegative ? `-${formatted}` : formatted;
    } else {
      const formatted = `${prefixUnit}${Number(absValue.toFixed(decimals))}${suffix}`;
      return isNegative ? `-${formatted}` : formatted;
    }
  }

  let scaled = absValue;
  let tier = 0;

  while (scaled >= 1000 && tier < prefixes.length - 1) {
    scaled /= 1000;
    tier++;
  }

  const formattedNum = Number(scaled.toFixed(decimals));
  const formatted = `${prefixUnit}${formattedNum}${prefixes[tier]}${suffix}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function formatPollution(value: number): string {
  return formatWithPrefix(value, 1000, ['', 'k', 'M', 'G', 'T', 'P', 'E'], '%/hr', '', 3);
}

export function formatPower(value: number, isCapacity = false): string {
  const suffix = isCapacity ? 'MF' : 'MF/s';
  return formatWithPrefix(value, 1000, ['', 'k', 'M', 'G', 'T', 'P', 'E'], suffix);
}

export function formatTemperature(value: number): string {
  return formatWithPrefix(value, 10000, ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi'], '°C');
}

export function formatCurrency(value: number): string {
  return formatWithPrefix(value, 10000, ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi'], '', '$');
}

export function formatRpMultiplier(value: number): string {
  return formatWithPrefix(value, 10000, ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi'], 'x');
}

export function formatTime(seconds: number): string {
  const isNegative = seconds < 0;
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) {
    const formattedNum = Number(absSeconds.toFixed(2));
    const result = `${formattedNum}s`;
    return isNegative ? `-${result}` : result;
  }

  if (absSeconds < 3600) {
    const m = Math.floor(absSeconds / 60);
    const s = Number((absSeconds % 60).toFixed(2));
    const sStr = s > 0 ? ` ${s}s` : '';
    const result = `${m}m${sStr}`;
    return isNegative ? `-${result}` : result;
  }

  const h = Math.floor(absSeconds / 3600);
  const rem = absSeconds % 3600;
  const m = Math.floor(rem / 60);
  const s = Number((rem % 60).toFixed(2));

  const mStr = m > 0 ? ` ${m}m` : '';
  const sStr = s > 0 ? ` ${s}s` : '';
  const result = `${h}h${mStr}${sStr}`;
  return isNegative ? `-${result}` : result;
}

function formatWithCommasAndCounting(
  value: number,
  rawFormatter: (val: number) => string,
  conversionLimit = 100000,
): string {
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  if (absValue < conversionLimit) {
    const rawFormatted = rawFormatter(absValue);
    const [integerPart, decimalPart] = rawFormatted.split('.');
    if (absValue >= 1000) {
      const formattedInteger = parseInt(integerPart, 10).toLocaleString('en-US');
      const formatted = decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
      return isNegative ? `-${formatted}` : formatted;
    } else {
      return isNegative ? `-${rawFormatted}` : rawFormatted;
    }
  }

  const prefixes = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi'];
  let scaled = absValue;
  let tier = 0;

  while (scaled >= 1000 && tier < prefixes.length - 1) {
    scaled /= 1000;
    tier++;
  }

  const formattedNum = Number(scaled.toFixed(2));
  const formatted = `${formattedNum}${prefixes[tier]}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return value < 0 ? '-∞' : '∞';
  }
  return formatWithCommasAndCounting(value, (val) => toPlainString(val, 4), 100000);
}

export function formatMachineCount(value: number): string {
  if (!Number.isFinite(value)) {
    return value < 0 ? '-∞' : '∞';
  }
  return formatWithCommasAndCounting(value, (val) => toPlainString(val, 2), 100000);
}

export function toRomanNumeral(num: number): string {
  const romanNumerals = [
    { value: 1000, symbol: 'M' },
    { value: 900, symbol: 'CM' },
    { value: 500, symbol: 'D' },
    { value: 400, symbol: 'CD' },
    { value: 100, symbol: 'C' },
    { value: 90, symbol: 'XC' },
    { value: 50, symbol: 'L' },
    { value: 40, symbol: 'XL' },
    { value: 10, symbol: 'X' },
    { value: 9, symbol: 'IX' },
    { value: 5, symbol: 'V' },
    { value: 4, symbol: 'IV' },
    { value: 1, symbol: 'I' },
  ];

  let result = '';
  let remaining = num;

  for (const { value, symbol } of romanNumerals) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }

  return result;
}

