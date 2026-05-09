import React, { useState, useRef, useEffect } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  className?: string;
  getKey?: (item: T, index: number) => string | number;
  children: (item: T, index: number) => React.ReactNode;
}

export default function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 5,
  className = '',
  getKey,
  children,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollTopRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const [range, setRange] = useState(() => {
    const start = 0;
    const end = items.length > 0 ? Math.min(items.length - 1, Math.ceil(height / itemHeight) + overscan) : -1;
    return { start, end };
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    scrollTopRef.current = e.currentTarget.scrollTop;

    if (rafIdRef.current !== null) return; // already scheduled for this frame

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const top = scrollTopRef.current;
      const start = Math.max(0, Math.floor(top / itemHeight) - overscan);
      const end = items.length > 0 ? Math.min(items.length - 1, Math.ceil((top + height) / itemHeight) + overscan) : -1;
      setRange({ start, end });
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const top = el.scrollTop;
      const start = Math.max(0, Math.floor(top / itemHeight) - overscan);
      const end = items.length > 0 ? Math.min(items.length - 1, Math.ceil((top + height) / itemHeight) + overscan) : -1;
      setRange({ start, end });
    }
  }, [items, height, itemHeight, overscan]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const totalHeight = items.length * itemHeight;

  const visibleItems: React.ReactNode[] = [];
  for (let i = range.start; i <= range.end; i++) {
    const item = items[i];
    if (item !== undefined) {
      const itemStyle: React.CSSProperties = {
        position: 'absolute',
        top: i * itemHeight,
        left: 0,
        right: 0,
        height: itemHeight,
        boxSizing: 'border-box',
      };

      let stableKey: string | number = `vl-item-${i}`;
      if (getKey) {
        stableKey = getKey(item, i);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if ('id' in obj && obj.id !== null && obj.id !== undefined) {
          stableKey = String(obj.id);
        } else if ('key' in obj && obj.key !== null && obj.key !== undefined) {
          stableKey = String(obj.key);
        } else if ('name' in obj && obj.name !== null && obj.name !== undefined) {
          stableKey = `${String(obj.name)}-${i}`;
        }
      }

      visibleItems.push(
        <div key={stableKey} style={itemStyle}>
          {children(item, i)}
        </div>,
      );
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={className}
      style={{
        height,
        overflowY: 'auto',
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          height: totalHeight,
          width: '100%',
          position: 'relative',
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}
