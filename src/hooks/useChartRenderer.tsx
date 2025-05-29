
"use client";

import React, { useState, useCallback, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip, // Keep this alias if ChartTooltip from ui/chart is different
} from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig as PageChartConfig,
} from "@/components/ui/chart";

export interface ChartDataPoint {
  x: number;
  [key: string]: number | undefined;
}

interface UseChartRendererProps {
  currentProcedureName?: string;
  converterModelForFilename?: string;
  procedureInputForFilename?: string;
  showEmailFormHandler?: (imageBase64: string) => void;
  logUpdater?: (updater: (prevLog: string) => string) => void;
}

export interface UseChartRendererReturn {
  chartData: ChartDataPoint[];
  setChartData: React.Dispatch<React.SetStateAction<ChartDataPoint[]>>;
  chartConfig: PageChartConfig;
  setChartConfig: React.Dispatch<React.SetStateAction<PageChartConfig>>;
  isChartReady: boolean;
  setIsChartReady: React.Dispatch<React.SetStateAction<boolean>>;
  ChartDisplayComponent: () => JSX.Element | null;
  triggerChartCapture: () => Promise<void>;
}

export const useChartRenderer = ({
  currentProcedureName,
  converterModelForFilename,
  procedureInputForFilename,
  showEmailFormHandler,
  logUpdater,
}: UseChartRendererProps): UseChartRendererReturn => {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartConfig, setChartConfig] = useState<PageChartConfig>({});
  const [isChartReady, setIsChartReady] = useState(false);

  const triggerChartCapture = useCallback(async () => {
    const chartElement = document.getElementById('efficiency-chart-card-from-hook');
    if (!chartElement) {
      logUpdater?.((prev: string) => prev + `${String.fromCharCode(10)}Error: Chart element (from hook) not found.`);
      return;
    }
    logUpdater?.((prev: string) => prev + `${String.fromCharCode(10)}Capturing chart (from hook)...`);
    try {
      const canvas = await html2canvas(chartElement);
      const imageBase64 = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const filename = `${converterModelForFilename || 'converter'}-${procedureInputForFilename?.replace(/[^a-zA-Z0-9]/g, '_') || 'procedure'}.png`;
      link.download = filename;
      link.href = imageBase64;
      link.click();
      logUpdater?.((prev: string) => prev + `${String.fromCharCode(10)}Chart captured (from hook) and download initiated. Preparing email form...`);
      if (showEmailFormHandler) {
        showEmailFormHandler(imageBase64);
      } else {
        logUpdater?.((prev: string) => prev + `${String.fromCharCode(10)}Error: Email form handler not available (from hook).`);
      }
    } catch (error: any) {
      logUpdater?.((prev: string) => prev + `${String.fromCharCode(10)}Error capturing chart (from hook): ${error.message}`);
    }
  }, [converterModelForFilename, procedureInputForFilename, showEmailFormHandler, logUpdater]);

  const chartLines = useMemo(() => {
    if (!isChartReady || !chartConfig || typeof chartConfig !== 'object') {
      return null;
    }
    const keys = Object.keys(chartConfig);
    if (keys.length === 0) {
      return null;
    }
    return keys.map((configKey) => {
      const seriesConfig = chartConfig[configKey];
      if (!seriesConfig) return null; 

      const yAxisIdToUse = currentProcedureName === 'SwVin' && configKey === 'vo' ? 'vo' : 'efficiency';
      return (
        <Line
          key={configKey}
          type="monotone"
          dataKey={configKey}
          stroke={seriesConfig.color} 
          yAxisId={yAxisIdToUse}
          name={seriesConfig.label as string || configKey} 
          strokeWidth={2} // Explicitly set strokeWidth
        />
      );
    });
  }, [isChartReady, chartConfig, currentProcedureName]);

  const ChartDisplayComponent = useCallback(() => {
    if (!isChartReady || chartData.length === 0 || Object.keys(chartConfig).length === 0) {
      return null;
    }
    return (
      <Card id="efficiency-chart-card-from-hook" className="w-full mt-4 shadow-sm">
        <div className="flex justify-end p-2">
          <Button onClick={triggerChartCapture} size="sm">Capture Plot</Button>
        </div>
        <CardHeader>
          <CardTitle>{currentProcedureName === 'SwVin' ? 'Efficiency and Vo vs. Input Voltage' : 'Efficiency vs. Output Power'}</CardTitle>
          <CardDescription>{currentProcedureName === 'SwVin' ? 'Efficiency and Output Voltage curves at varying input voltages (Eff = Po/Pi)' : 'Efficiency curves at different input voltages (Eff = Po/Pi)'}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
            <LineChart data={chartData} margin={{ top: 5, right: currentProcedureName === 'SwVin' ? 130 : 100, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" name={currentProcedureName === 'SwVin' ? 'Input Voltage (Vin)' : 'Output Power (Po)'} label={{ value: currentProcedureName === 'SwVin' ? 'Input Voltage (Vin) (V)' : 'Output Power (Po) (W)', position: "insideBottom", offset: -15 }} domain={['auto', 'auto']} tickFormatter={(value) => Number(value).toFixed(1)} allowDuplicatedCategory={false} />
              {currentProcedureName === 'SwVin' ? (
                <>
                  <YAxis yAxisId="efficiency" name="Efficiency" label={{ value: "Efficiency (Eff)", angle: -90, position: "insideLeft" }} domain={[0, 'auto']} tickFormatter={(value) => Number(value).toFixed(3)} />
                  {chartConfig && (chartConfig as any)['vo'] && (<YAxis yAxisId="vo" orientation="right" name="Output Voltage (Vo)" label={{ value: "Output Voltage (Vo) (V)", angle: 90, position: "insideRight" }} domain={['auto', 'auto']} tickFormatter={(value) => Number(value).toFixed(2)} stroke={(chartConfig as any)['vo']?.color} /> )}
                </>
              ) : (
                <YAxis yAxisId="efficiency" name="Efficiency (Eff)" label={{ value: "Efficiency (Eff)", angle: -90, position: "insideLeft" }} domain={[0, 'auto']} tickFormatter={(value) => Number(value).toFixed(3)} />
              )}
              <ChartTooltip cursor={true} content={<ChartTooltipContent labelFormatter={(value, payload) => currentProcedureName === 'SwVin' ? `Vin: ${Number(payload?.[0]?.payload?.x || value).toFixed(2)} V` : `Po: ${Number(payload?.[0]?.payload?.x || value).toFixed(2)} W`} formatter={(value, name, props) => { const label = (chartConfig as any)[name as string]?.label || name; return [(value as number).toFixed(currentProcedureName === 'SwVin' && name === 'vo' ? 2 : 3), label]; }} />} />
              {chartLines}
              <ChartLegend content={<ChartLegendContent />} layout="vertical" verticalAlign="middle" align="right" />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    );
  }, [isChartReady, chartData, chartConfig, currentProcedureName, triggerChartCapture, chartLines]);

  return {
    chartData, setChartData,
    chartConfig, setChartConfig,
    isChartReady, setIsChartReady,
    ChartDisplayComponent,
    triggerChartCapture,
  };
};

    
