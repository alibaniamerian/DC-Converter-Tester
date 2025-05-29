// src/hooks/useChartRenderer.tsx
"use client";

import React, { useMemo } from 'react';

export const useChartRenderer = () => {
  const chartLines = useMemo(() => {
    const items = ['a', 'b', 'c'];
    return items.map((itemKey) => {
      return <div key={itemKey}>{itemKey}</div>; 
    });
  }, []);

  const ChartDisplayComponent = () => {
    return <div>{chartLines}</div>;
  };

  return { ChartDisplayComponent };
};
