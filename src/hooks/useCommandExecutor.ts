"use client";
/// <reference lib="dom" />

import React, { useState, useCallback } from 'react';
import useTestResultsFirestore from './useTestResultsFirestore'; // Import the Firestore hook

// Define QueuedCommand and ChartDataPoint if not imported from a shared types file
// For now, assuming QueuedCommand might be defined in a shared types file or useCommandQueueManager
// and ChartDataPoint is also potentially shared.

export interface QueuedCommand {
  text: string;
  targetPort: 'COM3' | 'COM6';
  meta?: { calculatesPo?: boolean; calculatesPi?: boolean; calculatesEff?: boolean };
}

export interface ChartDataPoint { 
  x: number; 
  [key: string]: number | undefined; 
}

// This should match the definition in @/components/ui/chart or be imported
export interface ChartConfig { // Make sure this matches what page.tsx expects for its ChartContainer
  [key: string]: {
    label: string;
    color: string;
  } | undefined;
}

export interface UseCommandExecutorProps {
  commands: QueuedCommand[];
  isConnected1: boolean;
  port1: SerialPort | null;
  isConnected2: boolean;
  port2: SerialPort | null;
  userTimeout: string;
  currentProcedureName: string | undefined;
  deviceParams: { // Updated deviceParams type to include serialNumber and scannedDate
    nominalPower: string;
    viMin: string;
    viMax: string;
    voNominal: string;
    serialNumber: string; // Added
    scannedDate: string; // Added
  };
  sendAndRead: (
    port: SerialPort | null,
    commandToSend: string,
    responseUpdater: React.Dispatch<React.SetStateAction<string>>,
    timeoutMs: number,
    lineEnding?: string,
    responseDelimiter?: string
  ) => Promise<string>;
  setPageResponse: React.Dispatch<React.SetStateAction<string>>; // Main page response updater
  setCommandResponsesInPage: React.Dispatch<React.SetStateAction<string[]>>; // To update the page's commandResponses state
  setChartDataInPage: React.Dispatch<React.SetStateAction<ChartDataPoint[]>>;
  setChartConfigInPage: React.Dispatch<React.SetStateStateAction<ChartConfig>>;
  setIsChartReadyInPage: React.Dispatch<React.SetStateAction<boolean>>;
  setIsBusyInPage: React.Dispatch<React.SetStateAction<boolean>>; // To set the general page busy state
}

export interface UseCommandExecutorReturn {
  isExecuting: boolean; // Specific busy state for this hook
  executeAllCommands: () => Promise<void>;
}

const lineColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export const useCommandExecutor = ({
  commands,
  isConnected1,
  port1,
  isConnected2,
  port2,
  userTimeout,
  currentProcedureName,
  deviceParams, // Destructure deviceParams (now includes serialNumber and scannedDate)
  sendAndRead,
  setPageResponse,
  setCommandResponsesInPage, // Renamed for clarity
  setChartDataInPage,        // Renamed for clarity
  setChartConfigInPage,        // Renamed for clarity
  setIsChartReadyInPage,     // Renamed for clarity
  setIsBusyInPage            // Renamed for clarity
}: UseCommandExecutorProps): UseCommandExecutorReturn => {
  const [isExecuting, setIsExecuting] = useState(false);
  const { addTestResult } = useTestResultsFirestore(); // Use the Firestore hook

  const executeAllCommands = useCallback(async () => {
    if (isExecuting) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Executor is already busy.`);
      return;
    }
    if (!isConnected1 && !isConnected2) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Neither COM3 nor COM6 is active. Please activate a port.`);
      return;
    }
    if (commands.length === 0) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}No commands in queue to execute.`);
      return;
    }

    let parsedTimeout = parseInt(userTimeout, 10);
    if (userTimeout.trim() === '' || isNaN(parsedTimeout) || parsedTimeout <= 0) {
      parsedTimeout = 1000;
    }

    setIsExecuting(true);
    setIsBusyInPage(true); // Also set the general page busy state
    setIsChartReadyInPage(false);
    setChartDataInPage([]);
    setChartConfigInPage({});
    let tempUpdatedResponses: string[] = Array(commands.length * 8).fill('');
    setCommandResponsesInPage([...tempUpdatedResponses]); // Initialize for display

    let collectedSwPoData: Record<number, { [viKey: string]: number }> = {};
    let collectedSwVinData: Array<{ vin: number; vo?: number; eff?: number }> = [];
    let uniqueViKeysForSwPo = new Set<string>();
    let lastMeasuredVi: number | undefined = undefined;
    let lastMeasuredVo: number | undefined = undefined;

    for (let i = 0; i < commands.length; i++) {
      const cmdInfo = commands[i];
      let targetPortSerial: SerialPort | null = null;
      let targetPortName: string = '';

      if (cmdInfo.targetPort === 'COM3') {
        if (isConnected1 && port1) { targetPortSerial = port1; targetPortName = 'COM3';}
        else {
          setPageResponse(prev => prev + `${String.fromCharCode(10)}Skipping cmd "${cmdInfo.text}": COM3 not active.`);
          tempUpdatedResponses[i * 8] = 'Skipped (COM3 inactive)';
          setCommandResponsesInPage([...tempUpdatedResponses]);
          continue;
        }
      } else {
        if (isConnected2 && port2) { targetPortSerial = port2; targetPortName = 'COM6';}
        else {
          setPageResponse(prev => prev + `${String.fromCharCode(10)}Skipping cmd "${cmdInfo.text}": COM6 not active.`);
          tempUpdatedResponses[i * 8] = 'Skipped (COM6 inactive)';
          setCommandResponsesInPage([...tempUpdatedResponses]);
          continue;
        }
      }
      // Pass setPageResponse for individual command logging by sendAndRead
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Sending to ${targetPortName}: "${cmdInfo.text}"`); 
      try {
        const cmdResponse = await sendAndRead(targetPortSerial, cmdInfo.text, setPageResponse, parsedTimeout);
        tempUpdatedResponses[i * 8] = cmdResponse;

        if (cmdInfo.text.endsWith('?')) {
          const parts = cmdResponse.split(',').map(p => p.trim());
          if (cmdInfo.targetPort === 'COM3') { 
            switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) { tempUpdatedResponses[i * 8 + 1] = parts[0]; lastMeasuredVi = parseFloat(parts[0]); if(isNaN(lastMeasuredVi)) lastMeasuredVi = undefined; }
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 2] = parts[0];
                if (cmdInfo.meta?.calculatesPi) {
                  let viStrToUse = '';
                  if (i > 0 && commands[i-1]?.text === 'MEAS:VOLT?' && commands[i-1]?.targetPort === 'COM3') { viStrToUse = tempUpdatedResponses[(i-1) * 8 + 1]; }
                  else { if (lastMeasuredVi !== undefined) { viStrToUse = lastMeasuredVi.toString(); }
                  else { for (let k = i - 1; k >= 0; k--) { if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM3') { viStrToUse = tempUpdatedResponses[k * 8 + 1]; break; }}}}
                  const prevVi = parseFloat(viStrToUse); const currentIi = parseFloat(parts[0]);
                  if (!isNaN(prevVi) && !isNaN(currentIi)) { tempUpdatedResponses[i * 8 + 3] = (prevVi * currentIi).toFixed(2); }
                }
                break;
              case 'MEAS:POW?': if (parts.length > 0) tempUpdatedResponses[i * 8 + 3] = parts[0]; break;
              case 'MEAS:ALL?':
                if (parts.length > 0) { tempUpdatedResponses[i * 8 + 1] = parts[0]; lastMeasuredVi = parseFloat(parts[0]); if(isNaN(lastMeasuredVi)) lastMeasuredVi = undefined; }
                if (parts.length > 1) tempUpdatedResponses[i * 8 + 2] = parts[1];
                if (parts.length > 2) tempUpdatedResponses[i * 8 + 3] = parts[2];
                break;
            }
          } else if (cmdInfo.targetPort === 'COM6') { 
             switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) { tempUpdatedResponses[i * 8 + 4] = parts[0]; lastMeasuredVo = parseFloat(parts[0]); if(isNaN(lastMeasuredVo)) lastMeasuredVo = undefined; }
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 5] = parts[0];
                let poVal: number | undefined = undefined; const currentIo = parseFloat(parts[0]);
                if (cmdInfo.meta?.calculatesPo) {
                  let prevVoStr = '';
                  if (i > 0 && commands[i-1]?.text === 'MEAS:VOLT?' && commands[i-1]?.targetPort === 'COM6') { prevVoStr = tempUpdatedResponses[(i-1) * 8 + 4]; }
                  else { for (let k = i - 1; k >= 0; k--) { if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM6') { prevVoStr = tempUpdatedResponses[k * 8 + 4]; break; }}}
                  const prevVo = parseFloat(prevVoStr);
                  if (!isNaN(prevVo) && !isNaN(currentIo)) { poVal = parseFloat((prevVo * currentIo).toFixed(2)); tempUpdatedResponses[i * 8 + 6] = poVal.toString(); }
                }
                if (cmdInfo.meta?.calculatesEff && lastMeasuredVi !== undefined) {
                  let piToUseForEff: number | undefined;
                  if (i > 0 && commands[i-1]?.text === 'MEAS:CURR?' && commands[i-1]?.targetPort === 'COM3' && commands[i-1]?.meta?.calculatesPi) { piToUseForEff = parseFloat(tempUpdatedResponses[(i-1) * 8 + 3]); }
                  else { for (let k = i - 1; k >=0; k--) { if (commands[k].text === 'MEAS:CURR?' && commands[k].targetPort === 'COM3' && commands[k].meta?.calculatesPi) { piToUseForEff = parseFloat(tempUpdatedResponses[k*8+3]); break; }
                  else if (commands[k].text === 'MEAS:POW?' && commands[k].targetPort === 'COM3') { piToUseForEff = parseFloat(tempUpdatedResponses[k*8+3]); break; }
                  else if (commands[k].text === 'MEAS:ALL?' && commands[k].targetPort === 'COM3' && tempUpdatedResponses[k*8+3]) { piToUseForEff = parseFloat(tempUpdatedResponses[k*8+3]); break; }}}
                  const currentEffForStep = (poVal !== undefined && piToUseForEff !== undefined && piToUseForEff !== 0) ? parseFloat((poVal / piToUseForEff).toFixed(3)) : undefined;
                  if (currentEffForStep !== undefined) { tempUpdatedResponses[i * 8 + 7] = currentEffForStep.toString(); }
                  if (currentProcedureName === 'SwVin') {
                    let vinForThisPoint: number | undefined = lastMeasuredVi; let voForThisPoint: number | undefined = lastMeasuredVo;
                    if (commands[i-3]?.text === 'MEAS:VOLT?' && commands[i-3]?.targetPort === 'COM3') { const vinStr = tempUpdatedResponses[(i-3) * 8 + 1]; if (vinStr) vinForThisPoint = parseFloat(vinStr); }
                    if (commands[i-2]?.text === 'MEAS:VOLT?' && commands[i-2]?.targetPort === 'COM6') { const voStr = tempUpdatedResponses[(i-2) * 8 + 4]; if (voStr) voForThisPoint = parseFloat(voStr); }
                    if (vinForThisPoint !== undefined && !isNaN(vinForThisPoint) && currentEffForStep !== undefined) { collectedSwVinData.push({ vin: vinForThisPoint, vo: voForThisPoint, eff: currentEffForStep });}
                  } else { if (poVal !== undefined && currentEffForStep !== undefined && lastMeasuredVi !== undefined) { const viKey = `eff_${lastMeasuredVi.toFixed(1)}`; uniqueViKeysForSwPo.add(viKey); if (!collectedSwPoData[poVal]) { collectedSwPoData[poVal] = {};} collectedSwPoData[poVal][viKey] = currentEffForStep;}}
                }
                break;
              case 'MEAS:POW?': if (parts.length > 0) tempUpdatedResponses[i * 8 + 6] = parts[0]; break;
              case 'MEAS:ALL?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 4] = parts[0];
                if (parts.length > 1) tempUpdatedResponses[i * 8 + 5] = parts[1];
                if (parts.length > 2) tempUpdatedResponses[i * 8 + 6] = parts[2];
                break;
            }
          }
        }
      } catch (error: any) {
        setPageResponse(prev => prev + `${String.fromCharCode(10)}Error during command "${cmdInfo.text}": ${error.message}`);
        tempUpdatedResponses[i * 8] = 'Error';
        for (let k = 1; k < 8; k++) tempUpdatedResponses[i * 8 + k] = '';
      }
      setCommandResponsesInPage([...tempUpdatedResponses]);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between commands
    }

    const newChartConfigLocal: ChartConfig = {};
    let finalChartData: ChartDataPoint[] = [];
    if (currentProcedureName === 'SwVin') {
      collectedSwVinData.sort((a, b) => a.vin - b.vin);
      finalChartData = collectedSwVinData.map(dp => ({ x: dp.vin, efficiency: dp.eff, vo: dp.vo }));
      if (finalChartData.some(d => d.efficiency !== undefined)) { newChartConfigLocal['efficiency'] = { label: 'Efficiency', color: lineColors[0] }; }
      if (finalChartData.some(d => d.vo !== undefined)) { newChartConfigLocal['vo'] = { label: 'Vo (V)', color: lineColors[1] }; }
    } else {
      finalChartData = Object.entries(collectedSwPoData).map(([poStr, viEffMap]) => ({ x: parseFloat(poStr), ...viEffMap })).sort((a, b) => a.x - b.x);
      Array.from(uniqueViKeysForSwPo).sort((a,b) => parseFloat(a.split('_')[1]) - parseFloat(b.split('_')[1])).forEach((viKey, index) => { const viValue = viKey.split('_')[1]; newChartConfigLocal[viKey] = { label: `Eff @ ${viValue}V`, color: lineColors[index % lineColors.length]}; });
    }
    setChartDataInPage(finalChartData);
    setChartConfigInPage(newChartConfigLocal);

    // Save results to Firestore
    if (currentProcedureName && finalChartData.length > 0) {
      try {
        await addTestResult({
          procedureName: currentProcedureName,
          deviceParams: {
             nominalPower: deviceParams.nominalPower,
             viMin: deviceParams.viMin,
             viMax: deviceParams.viMax,
             voNominal: deviceParams.voNominal,
             serialNumber: deviceParams.serialNumber, // Include serial number
             scannedDate: deviceParams.scannedDate, // Include scanned date
          },
          testData: finalChartData,
          testTimestamp: new Date(), // Add the current test execution timestamp
        });
        setPageResponse(prev => prev + `${String.fromCharCode(10)}Test results saved to Firestore.`);
      } catch (error) {
        setPageResponse(prev => prev + `${String.fromCharCode(10)}Failed to save test results to Firestore: ${error}`);
        console.error("Error saving test results to Firestore:", error);
      }
    }

    if(finalChartData.length > 0) setIsChartReadyInPage(true);
    setPageResponse(prev => prev + `${String.fromCharCode(10)}All commands executed.`);
    setIsExecuting(false);
    setIsBusyInPage(false); // Clear general page busy state

  }, [
    commands,
    isConnected1, port1, isConnected2, port2,
    userTimeout, currentProcedureName, deviceParams, // deviceParams now includes serialNumber and scannedDate
    sendAndRead, setPageResponse,
    setCommandResponsesInPage, setChartDataInPage, setChartConfigInPage, setIsChartReadyInPage, setIsBusyInPage,
    isExecuting, // To prevent re-triggering if already executing
    addTestResult // Add addTestResult to dependency array
  ]);

  return {
    isExecuting,
    executeAllCommands,
  };
};
