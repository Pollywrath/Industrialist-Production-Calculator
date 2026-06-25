import React, { useState, useRef, useEffect } from 'react';
import styles from './VirtualList.module.css';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  scrollToKey?: string | number | null;
  getKey: (item: T, index: number) => string | number;
  children: (item: T, index: number) => React.ReactNode;
}

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 5,
  className = '',
  style = {},
  scrollToKey = null,
  getKey,
  children,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollTopRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const lastScrollToRef = useRef<{
    key: string | number;
    index: number;
    top: number;
    itemHeight: number;
    height: number;
  } | null>(null);

  const [range, setRange] = useState(() => {
    const start = 0;
    const end =
      items.length > 0 ? Math.min(items.length - 1, Math.ceil(height / itemHeight) + overscan) : -1;
    return { start, end };
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    scrollTopRef.current = e.currentTarget.scrollTop;

    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const top = scrollTopRef.current;
      const start = Math.max(0, Math.floor(top / itemHeight) - overscan);
      const end =
        items.length > 0
          ? Math.min(items.length - 1, Math.ceil((top + height) / itemHeight) + overscan)
          : -1;
      setRange((current) =>
        current.start === start && current.end === end ? current : { start, end },
      );
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const top = el.scrollTop;
      const start = Math.max(0, Math.floor(top / itemHeight) - overscan);
      const end =
        items.length > 0
          ? Math.min(items.length - 1, Math.ceil((top + height) / itemHeight) + overscan)
          : -1;
      setRange((current) =>
        current.start === start && current.end === end ? current : { start, end },
      );
    }
  }, [items.length, height, itemHeight, overscan]);

  useEffect(() => {
    if (scrollToKey === null) return;

    const el = containerRef.current;
    if (!el) return;

    let targetIndex = -1;
    for (let i = 0; i < items.length; i++) {
      if (getKey(items[i], i) === scrollToKey) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) return;

    const centeredOffset = Math.max(0, Math.floor((height - itemHeight) / 2));
    const maxScrollTop = Math.max(0, items.length * itemHeight - height);
    const nextTop = Math.min(maxScrollTop, Math.max(0, targetIndex * itemHeight - centeredOffset));
    const lastScrollTo = lastScrollToRef.current;
    if (
      lastScrollTo &&
      lastScrollTo.key === scrollToKey &&
      lastScrollTo.index === targetIndex &&
      lastScrollTo.top === nextTop &&
      lastScrollTo.itemHeight === itemHeight &&
      lastScrollTo.height === height &&
      Math.abs(el.scrollTop - nextTop) < 1
    ) {
      return;
    }

    el.scrollTop = nextTop;
    scrollTopRef.current = nextTop;
    lastScrollToRef.current = {
      key: scrollToKey,
      index: targetIndex,
      top: nextTop,
      itemHeight,
      height,
    };

    const start = Math.max(0, Math.floor(nextTop / itemHeight) - overscan);
    const end =
      items.length > 0
        ? Math.min(items.length - 1, Math.ceil((nextTop + height) / itemHeight) + overscan)
        : -1;
    setRange((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, [getKey, height, itemHeight, items, overscan, scrollToKey]);

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
        height: itemHeight,
        transform: `translateY(${i * itemHeight}px)`,
      };

      const stableKey = getKey(item, i);

      visibleItems.push(
        <div key={stableKey} className={styles.item} style={itemStyle}>
          {children(item, i)}
        </div>,
      );
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`${styles.container} ${className}`.trim()}
      style={{
        height,
        ...style,
      }}
    >
      <div
        className={styles.inner}
        style={{
          height: totalHeight,
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}
