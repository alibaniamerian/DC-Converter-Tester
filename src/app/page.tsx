
"use client";
/// <reference lib="dom" />

import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plug, Trash2 } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useComPort } from '../hooks/useComPort';
import { useProcedure } from '../hooks/useProcedure';
import { useConverterModel, type ConverterParams } from '../hooks/useConverterModel';
import { useEmailSender } from '../hooks/useEmailSender';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import html2canvas from 'html2canvas';


import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface QueuedCommand {
  text: string;
  targetPort: 'COM3' | 'COM6';
  meta?: { calculatesPo?: boolean; calculatesPi?: boolean; calculatesEff?: boolean };
}

interface MultiLineChartDataPoint {
  po: number;
  [key: string]: number | undefined;
}

const lineColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface DeviceProcedureParams {
  viMin: string;
  viMax: string;
  nominalPower: string;
  voNominal: string;
}

const procedureListItems = [
  {
    value: 'SwVin',
    label: 'SwVin(Vs1, Vs2, Nsw)',
    description: `Sweeps the input voltage (Vin) and takes measurements.
Parameters:
  Vs1: Starting input voltage (V). Defaults to Vi(min).
  Vs2: Ending input voltage (V). Defaults to Vi(max).
  Nsw: Number of sweep steps (2-20). Defaults to 2.`,
    getTemplate: (params: Partial<DeviceProcedureParams>) =>
      `SwVin(${params.viMin || ''}, ${params.viMax || ''}, )`,
  },
  {
    value: 'SwIo',
    label: 'SwIo(Is1, Is2, Nsw)',
    description: `Sweeps the output current (Io) and takes measurements.
Parameters:
  Is1: Starting output current (A). Defaults to 0.
  Is2: Ending output current (A). Defaults to (Nominal Power / Vo (Nominal)).
  Nsw: Number of sweep steps (2-20). Defaults to 2.`,
    getTemplate: (params: Partial<DeviceProcedureParams>) => {
      const nomP = parseFloat(params.nominalPower || '');
      const voN = parseFloat(params.voNominal || '');
      const defaultIs2 = (!isNaN(nomP) && !isNaN(voN) && voN !== 0)
        ? (nomP / voN).toFixed(2)
        : '';
      return `SwIo(, ${defaultIs2}, )`;
    },
  },
  {
    value: 'Pout',
    label: 'Pout(Is)',
    description: `Sets an optional output current Is, measures Vo & Io, then calculates Po.
Parameters:
  Is: Target output current (A) (optional).`,
    getTemplate: () => `Pout()`,
  },
  {
    value: 'Pin',
    label: 'Pin(Vs)',
    description: `Sets an optional input voltage Vs, measures Vi & Ii, then calculates Pi.
Parameters:
  Vs: Target input voltage (V) (optional, must be within Vi(min)/Vi(max)).`,
    getTemplate: () => `Pin()`,
  },
  {
    value: 'SwPo',
    label: 'SwPo(Ps1, Ps2, Nsw)',
    description: `Sweeps output power (Po). Calculates required Io based on Vo (Nominal).
Parameters:
  Ps1: Starting output power (W). Defaults to 0.
  Ps2: Ending output power (W). Defaults to Nominal Power.
  Nsw: Number of sweep steps (2-20). Defaults to 2.`,
    getTemplate: (params: Partial<DeviceProcedureParams>) =>
      `SwPo(, ${params.nominalPower || ''}, )`,
  },
  {
    value: 'SwPoVi',
    label: 'SwPoVi(Ps1, Ps2, Nsw, Vs1, Vs2, Nswv)',
    description: `Sweeps Po across a range of Vi. For each Vi step, performs a full SwPo sweep.
Parameters:
  Ps1, Ps2, Nsw: For inner SwPo sweep (defaults similar to SwPo).
  Vs1, Vs2, Nswv: For outer Vi sweep (defaults similar to SwVin for Vs1/Vs2).`,
    getTemplate: (params: Partial<DeviceProcedureParams>) =>
      `SwPoVi(, ${params.nominalPower || ''}, , ${params.viMin || ''}, ${params.viMax || ''}, )`,
  },
];


async function sendAndRead(
  port: SerialPort | null,
  commandToSend: string,
  responseUpdater: React.Dispatch<React.SetStateAction<string>>,
  timeoutMs: number,
  lineEnding: string = String.fromCharCode(10),
  responseDelimiter: string = String.fromCharCode(10)
): Promise<string> {
  if (!port) {
    throw new Error('Serial port is not connected.');
  }
  const writer = port.writable?.getWriter();
  const reader = port.readable?.getReader();
  if (!writer || !reader) {
    throw new Error('Failed to acquire port writer or reader.');
  }

  const expectResponse = commandToSend.endsWith('?');
  let responseData = '';

  try {
    responseUpdater(prev => prev + `Sending: "${commandToSend}"${lineEnding === String.fromCharCode(10) ? ' (LF)' : ''}${expectResponse ? '...' : ' (No Response Expected)'}`);
    const dataToSend = new TextEncoder().encode(commandToSend + lineEnding);
    await writer.write(dataToSend);

    if (!expectResponse) return "";

    let incomingData = '';
    let readerDone = false;
    const startTime = Date.now();

    while (!readerDone) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeLeft = timeoutMs - (Date.now() - startTime);
        if (timeLeft <= 0) {
          if (incomingData.length > 0) {
            readerDone = true; 
            // @ts-ignore
            resolve(); 
          } else {
            reject(new Error(`Timeout: No data received for "${commandToSend}" within ${timeoutMs}ms`));
          }
        } else {
          setTimeout(() => reject(new Error(`Read operation timed out for "${commandToSend}" after ${timeLeft}ms delay`)), timeLeft);
        }
      });

      const readChunkPromise = reader.read();

      try {
        // @ts-ignore
        const { value, done } = await Promise.race([readChunkPromise, timeoutPromise]);
        if (done) {
          readerDone = true; 
          break;
        }
        if (value) {
          const decodedChunk = new TextDecoder().decode(value);
          incomingData += decodedChunk;
          if (incomingData.includes(responseDelimiter)) {
             readerDone = true; 
             break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Timeout: No data received')) {
          throw error; 
        }
        if (incomingData.length > 0 && !(error instanceof Error && error.message.includes('timed out after'))) {
          readerDone = true; 
          break;
        } else {
          throw error;
        }
      }
    }
    
    responseData = incomingData.split(responseDelimiter)[0].trim();
    responseUpdater(prev => prev + `${String.fromCharCode(10)}Response: ${responseData}`);
    return responseData;

  } catch (error: any) {
    responseUpdater(prev => prev + `${String.fromCharCode(10)}Error during send/read for "${commandToSend}": ${error.message}`);
    throw error; 
  } finally {
    if (reader?.releaseLock) {
      try { await reader.cancel(); } catch (_) { /* Ignore */ }
      reader.releaseLock();
    }
    if (writer?.releaseLock) {
      writer.releaseLock();
    }
  }
}


export default function Home() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [commands, setCommands] = useState<QueuedCommand[]>([]);
  const [selectedCommandPort, setSelectedCommandPort] = useState<'COM3' | 'COM6'>('COM3');
  const [isBusy, setIsBusy] = useState(false);
  const [isPort1Busy, setIsPort1Busy] = useState(false);
  const [isPort2Busy, setIsPort2Busy] = useState(false);
  const [commandResponses, setCommandResponses] = useState<string[]>([]);
  const [chartData, setChartData] = useState<MultiLineChartDataPoint[]>([]);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({});
  const responseLogRef = useRef<HTMLTextAreaElement>(null);


  const [nominalPower, setNominalPower] = useState('');
  const [viMin, setViMin] = useState('');
  const [viMax, setViMax] = useState('');
  const [voNominal, setVoNominal] = useState('');
  const [userTimeout, setUserTimeout] = useState<string>('');
  const [selectedProcedureDescription, setSelectedProcedureDescription] = useState<string | null>(null);


  const { converterModel, setConverterModel, availableModels, loadConverterParams, saveConverterParams } = useConverterModel();

  const {
    showUserInfoForm,
    userName, setUserName,
    userEmail, setUserEmail,
    userCompany, setUserCompany,
    userIndustry, setUserIndustry,
    userPhone, setUserPhone,
    isSendingEmail,
    handleShowUserInfoForm, 
    handleSendEmail,        
  } = useEmailSender({
    deviceModel: converterModel, 
    nominalPower: nominalPower, 
    viMin: viMin,               
    viMax: viMax,               
    voNominal: voNominal,       
  });
  
  const { port1, isConnected1, activatePort1, port2, isConnected2, activatePort2 } = useComPort({
    setIsBusy: setIsBusy, 
    setResponse,
    setCommandResponses, 
    sendAndRead, 
  });

  const {
    procedureText,
    setProcedureText,
    generateCommandsFromProcedure,
  } = useProcedure(viMin, viMax, nominalPower, voNominal);

  useEffect(() => {
    if (responseLogRef.current) {
      responseLogRef.current.scrollTop = responseLogRef.current.scrollHeight;
    }
  }, [response]);
    
    const handleCaptureChart = async () => {
      const chartElement = document.getElementById('efficiency-chart-card');
      if (!chartElement) {
        setResponse(prev => prev + `${String.fromCharCode(10)}Error: Chart element not found.`);
        return;
      }
  
      setResponse(prev => prev + `${String.fromCharCode(10)}Capturing chart...`);
      try {
          const canvas = await html2canvas(chartElement);
          const imageBase64 = canvas.toDataURL('image/png');
  
          const link = document.createElement('a');
          const filename = `${converterModel || 'converter'}-${procedureText.replace(/[^a-zA-Z0-9]/g, '_') || 'procedure'}.png`;
          link.download = filename;
          link.href = imageBase64;
          link.click();
          setResponse(prev => prev + `${String.fromCharCode(10)}Chart captured and download initiated. Preparing email form...`);
  
          if (handleShowUserInfoForm) {
            handleShowUserInfoForm(imageBase64); 
          } else {
            setResponse(prev => prev + `${String.fromCharCode(10)}Error: Email form handler not available.`);
          }
  
      } catch (error: any) {
           setResponse(prev => prev + `${String.fromCharCode(10)}Error capturing chart: ${error.message}`);
      }
    };


  const handleAddCommand = () => {
    if (!command.trim()) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Please enter a command to send.`);
      return;
    }
    setCommands(prevCommands => [...prevCommands, { text: command, targetPort: selectedCommandPort }]);
    setCommandResponses(prevResponses => [
      ...prevResponses,
      ...Array(8).fill('')
    ]);
    setCommand('');
  };

  const handleAddProcedureToQueue = () => {
    const { commands: procedureCommands, error } = generateCommandsFromProcedure();

    if (error) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Procedure Error: ${error}`);
      return;
    }

    if (procedureCommands.length === 0 && !procedureText.trim()) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Please enter a procedure to add.`);
      return;
    }
    
    if (procedureCommands.length === 0 && procedureText.trim()) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Procedure not recognized or generated no commands. Supported: SwVin, SwIo, SwPo, SwPoVi, Pout(Is), Pin(Vs).`);
      return;
    }

    if (procedureCommands.length > 0) {
      setCommands(prevCommands => [...prevCommands, ...procedureCommands]);
      setCommandResponses(prevResponses => [
        ...prevResponses,
        ...Array(procedureCommands.length * 8).fill('')
      ]);
      setProcedureText('');
      setSelectedProcedureDescription(null); 
    }
  };


  const handleRemoveCommand = (indexToRemove: number) => {
    setCommands(prevCommands => prevCommands.filter((_, index) => index !== indexToRemove));
    setCommandResponses(prevResponses => {
      const newResponses = [...prevResponses];
      newResponses.splice(indexToRemove * 8, 8);
      return newResponses;
    });
  };

  const handleActivatePort1 = async () => {
    setIsPort1Busy(true);
    await activatePort1({});
    setIsPort1Busy(false);
  };

  const handleActivatePort2 = async () => {
    setIsPort2Busy(true);
    await activatePort2({});
    setIsPort2Busy(false);
  };

  const handleSendMultipleCommands = async () => {
    if (isBusy) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Busy with previous operation. Please wait.`);
      return;
    }
    if (!isConnected1 && !isConnected2) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Neither COM3 nor COM6 is active. Please activate a port.`);
      return;
    }

    let parsedTimeout = parseInt(userTimeout, 10);
    if (userTimeout.trim() === '' || isNaN(parsedTimeout) || parsedTimeout <= 0) {
      parsedTimeout = 1000;
    }


    setIsBusy(true);
    setChartData([]);
    setChartConfig({});
    let tempUpdatedResponses = [...commandResponses];
    let collectedData: Record<number, { [viKey: string]: number }> = {};
    let uniqueViKeys = new Set<string>();
    let lastMeasuredVi: number | undefined = undefined;


    for (let i = 0; i < commands.length; i++) {
      const cmdInfo = commands[i];
      let targetPortSerial: SerialPort | null = null;
      let targetPortName: string = '';

      if (cmdInfo.targetPort === 'COM3') {
        if (isConnected1 && port1) { targetPortSerial = port1; targetPortName = 'COM3';}
        else { 
          setResponse(prev => prev + `${String.fromCharCode(10)}Skipping cmd "${cmdInfo.text}": COM3 not active.`);
          tempUpdatedResponses[i * 8] = 'Skipped (COM3 inactive)';
          setCommandResponses([...tempUpdatedResponses]);
          continue; 
        }
      } else {
        if (isConnected2 && port2) { targetPortSerial = port2; targetPortName = 'COM6';}
        else { 
          setResponse(prev => prev + `${String.fromCharCode(10)}Skipping cmd "${cmdInfo.text}": COM6 not active.`);
          tempUpdatedResponses[i * 8] = 'Skipped (COM6 inactive)';
          setCommandResponses([...tempUpdatedResponses]);
          continue; 
        }
      }

      setResponse(prev => prev + `${String.fromCharCode(10)}Sending to ${targetPortName}: "${cmdInfo.text}"`);
      try {
        const cmdResponse = await sendAndRead(targetPortSerial, cmdInfo.text, setResponse, parsedTimeout);
        tempUpdatedResponses[i * 8] = cmdResponse;

        if (cmdInfo.text.endsWith('?')) {
          const parts = cmdResponse.split(',').map(p => p.trim());
          if (cmdInfo.targetPort === 'COM3') {
            switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) {
                  tempUpdatedResponses[i * 8 + 1] = parts[0];
                  lastMeasuredVi = parseFloat(parts[0]);
                  if(isNaN(lastMeasuredVi)) lastMeasuredVi = undefined;
                }
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 2] = parts[0];
                if (cmdInfo.meta?.calculatesPi) {
                  let viStrToUse = '';
                  if (i > 0 && commands[i-1]?.text === 'MEAS:VOLT?' && commands[i-1]?.targetPort === 'COM3') {
                     viStrToUse = tempUpdatedResponses[(i-1) * 8 + 1];
                  } else {
                     if (lastMeasuredVi !== undefined) {
                        viStrToUse = lastMeasuredVi.toString();
                     } else {
                        for (let k = i - 1; k >= 0; k--) {
                          if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM3') {
                            viStrToUse = tempUpdatedResponses[k * 8 + 1];
                            break;
                          }
                        }
                     }
                  }

                  const prevVi = parseFloat(viStrToUse);
                  const currentIi = parseFloat(parts[0]);
                  if (!isNaN(prevVi) && !isNaN(currentIi)) {
                    tempUpdatedResponses[i * 8 + 3] = (prevVi * currentIi).toFixed(2);
                  }
                }
                break;
              case 'MEAS:POW?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 3] = parts[0];
                break;
              case 'MEAS:ALL?':
                if (parts.length > 0) {
                  tempUpdatedResponses[i * 8 + 1] = parts[0];
                  lastMeasuredVi = parseFloat(parts[0]);
                  if(isNaN(lastMeasuredVi)) lastMeasuredVi = undefined;
                }
                if (parts.length > 1) tempUpdatedResponses[i * 8 + 2] = parts[1];
                if (parts.length > 2) tempUpdatedResponses[i * 8 + 3] = parts[2];
                break;
            }
          } else if (cmdInfo.targetPort === 'COM6') {
            switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 4] = parts[0];
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 5] = parts[0];
                let poVal: number | undefined = undefined;
                let effVal: number | undefined = undefined;
                const currentIo = parseFloat(parts[0]);

                if (cmdInfo.meta?.calculatesPo) {
                  let prevVoStr = '';
                   if (i > 0 && commands[i-1]?.text === 'MEAS:VOLT?' && commands[i-1]?.targetPort === 'COM6') {
                     prevVoStr = tempUpdatedResponses[(i-1) * 8 + 4];
                   } else {
                     for (let k = i - 1; k >= 0; k--) {
                       if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM6') {
                         prevVoStr = tempUpdatedResponses[k * 8 + 4];
                         break;
                       }
                     }
                   }
                  const prevVo = parseFloat(prevVoStr);
                  if (!isNaN(prevVo) && !isNaN(currentIo)) {
                    poVal = parseFloat((prevVo * currentIo).toFixed(2));
                    tempUpdatedResponses[i * 8 + 6] = poVal.toString();
                  }
                }

                if (cmdInfo.meta?.calculatesEff && lastMeasuredVi !== undefined) {
                  let piToUseForEff: number | undefined;
                  if (i > 0 && commands[i-1]?.text === 'MEAS:CURR?' && commands[i-1]?.targetPort === 'COM3' && commands[i-1]?.meta?.calculatesPi) {
                    piToUseForEff = parseFloat(tempUpdatedResponses[(i-1) * 8 + 3]);
                  }
                  
                  if (poVal !== undefined && piToUseForEff !== undefined && piToUseForEff !== 0) {
                    effVal = parseFloat((poVal / piToUseForEff).toFixed(3));
                    tempUpdatedResponses[i * 8 + 7] = effVal.toString();
                  }

                   if (poVal !== undefined && effVal !== undefined && lastMeasuredVi !== undefined) {
                     const viKey = `eff_${lastMeasuredVi.toFixed(1)}`;
                     uniqueViKeys.add(viKey);
                     if (!collectedData[poVal]) {
                       collectedData[poVal] = {};
                     }
                     collectedData[poVal][viKey] = effVal;
                   }
                }
                break;
              case 'MEAS:POW?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 6] = parts[0];
                break;
              case 'MEAS:ALL?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 4] = parts[0];
                if (parts.length > 1) tempUpdatedResponses[i * 8 + 5] = parts[1];
                if (parts.length > 2) tempUpdatedResponses[i * 8 + 6] = parts[2];
                break;
            }
          }
        }
      } catch (error) {
        tempUpdatedResponses[i * 8] = 'Error';
        for (let k = 1; k < 8; k++) tempUpdatedResponses[i * 8 + k] = '';
      }
      setCommandResponses([...tempUpdatedResponses]);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const transformedData: MultiLineChartDataPoint[] = Object.entries(collectedData)
      .map(([poStr, viEffMap]) => ({
        po: parseFloat(poStr),
        ...viEffMap,
      }))
      .sort((a, b) => a.po - b.po);
   
    const newChartConfig: ChartConfig = {};
    Array.from(uniqueViKeys).sort((a, b) => parseFloat(a.split('_')[1]) - parseFloat(b.split('_')[1])).forEach((viKey, index) => {
      const viValue = viKey.split('_')[1];
      newChartConfig[viKey] = {
        label: `Eff @ ${viValue}V`,
        color: lineColors[index % lineColors.length],
      };
    });

    setChartData(transformedData);
    setChartConfig(newChartConfig);
    setIsBusy(false);
  };

  const handleModelSelectAndLoad = async (selectedValue: string) => {
    if (!selectedValue) return;
    setConverterModel(selectedValue); 
    
    setIsBusy(true);
    setResponse(prev => prev + `${String.fromCharCode(10)}Loading parameters for model: ${selectedValue}...`);
    const params = await loadConverterParams(selectedValue);
    if (params) {
      setNominalPower(params.nominalPower);
      setViMin(params.viMin);
      setViMax(params.viMax);
      setVoNominal(params.voNominal);
      setResponse(prev => prev + `${String.fromCharCode(10)}Parameters loaded for ${selectedValue}.`);
    } else {
      setResponse(prev => prev + `${String.fromCharCode(10)}Failed to load parameters for ${selectedValue}. Model not found or error occurred.`);
    }
    setIsBusy(false);
  };


  const handleSaveParams = async () => {
    if (!converterModel.trim()) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Please enter a Converter Model name to save parameters.`);
      return;
    }
    setIsBusy(true);
    const currentParams: ConverterParams = {
      nominalPower,
      viMin,
      viMax,
      voNominal,
    };
    setResponse(prev => prev + `${String.fromCharCode(10)}Saving parameters for model: ${converterModel}...`);
    const success = await saveConverterParams(converterModel, currentParams);
    if (success) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Parameters saved for ${converterModel}.`);
    } else {
      setResponse(prev => prev + `${String.fromCharCode(10)}Failed to save parameters for ${converterModel}.`);
    }
    setIsBusy(false);
  };

  const handleProcedureSelect = (value: string) => {
    const selectedProc = procedureListItems.find(p => p.value === value);
    if (selectedProc) {
      const currentParams: DeviceProcedureParams = {
        nominalPower,
        viMin,
        viMax,
        voNominal,
      };
      setProcedureText(selectedProc.getTemplate(currentParams));
      setSelectedProcedureDescription(selectedProc.description);
    } else {
      setSelectedProcedureDescription(null);
    }
  };

  const handleClientSendEmail = async () => {
    const result = await handleSendEmail(); // From useEmailSender hook
    if (result) {
      alert(result.message); // Display the server's response message
      if (result.success) {
        // Optionally reset form fields from useEmailSender if needed here
        // e.g., by calling a reset function exposed by useEmailSender
      }
    } else {
      alert('An unexpected error occurred while preparing to send the email.');
    }
  };


  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8 w-full">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0</h1>
      
      <div className="w-full max-w-[80rem] space-y-4">

        <div className="w-full p-4 border rounded-md shadow-sm">
          <Label htmlFor="converterModel" className="block text-sm font-medium text-foreground mb-1">Converter Model</Label>
          <div className="flex items-center gap-2">
             <Input
                id="converterModel"
                placeholder="Enter or select model..."
                value={converterModel}
                onChange={(e) => setConverterModel(e.target.value)}
                disabled={isBusy}
                className="flex-grow"
              />
            <Select value={converterModel} onValueChange={handleModelSelectAndLoad} disabled={isBusy}>
              <SelectTrigger className="w-[280px] h-10">
                <SelectValue placeholder="Load existing model..." />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSaveParams} disabled={isBusy || !converterModel.trim()} className="h-10">
              Save Params
            </Button>
          </div>
        </div>
        
        <div className="w-full p-4 border rounded-md shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-foreground">Device Parameters</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="nominalPower" className="block text-sm font-medium text-foreground mb-1">Nominal Power (W)</Label>
              <Input id="nominalPower" type="number" placeholder="e.g., 100" value={nominalPower} onChange={(e) => setNominalPower(e.target.value)} disabled={isBusy} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="viMin" className="block text-sm font-medium text-foreground mb-1">Vi (min) (V)</Label>
              <Input id="viMin" type="number" placeholder="e.g., 9" value={viMin} onChange={(e) => setViMin(e.target.value)} disabled={isBusy} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="viMax" className="block text-sm font-medium text-foreground mb-1">Vi (Max) (V)</Label>
              <Input id="viMax" type="number" placeholder="e.g., 36" value={viMax} onChange={(e) => setViMax(e.target.value)} disabled={isBusy} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="voNominal" className="block text-sm font-medium text-foreground mb-1">Vo (Nominal) (V)</Label>
              <Input id="voNominal" type="number" placeholder="e.g., 12" value={voNominal} onChange={(e) => setVoNominal(e.target.value)} disabled={isBusy} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="userTimeout" className="block text-sm font-medium text-foreground mb-1">Cmd Timeout (ms)</Label>
              <Input 
                id="userTimeout" 
                type="number" 
                placeholder="e.g., 1000" 
                value={userTimeout} 
                onChange={(e) => setUserTimeout(e.target.value)} 
                disabled={isBusy}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-md shadow-sm">
            <Label htmlFor="procedure" className="block text-sm font-medium text-foreground mb-1">Enter Procedure:</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="procedure"
                placeholder="e.g., SwPoVi(10,50,5,12,24,3) or select..."
                value={procedureText}
                onChange={(e) => setProcedureText(e.target.value)}
                className="flex-grow"
                disabled={isPort1Busy || isPort2Busy || isBusy}
              />
              <Select onValueChange={handleProcedureSelect} disabled={isPort1Busy || isPort2Busy || isBusy}>
                <SelectTrigger className="w-[250px] h-10">
                  <SelectValue placeholder="Select a procedure..." />
                </SelectTrigger>
                <SelectContent>
                  {procedureListItems.map((proc) => (
                    <SelectItem key={proc.value} value={proc.value}>
                      {proc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddProcedureToQueue} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy}>
              Add Procedure to Queue
            </Button>
            {selectedProcedureDescription && (
              <div className="mt-3 p-3 border rounded-md bg-muted/50 text-sm">
                <h4 className="font-semibold mb-1 text-foreground">Procedure Details:</h4>
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{selectedProcedureDescription}</pre>
              </div>
            )}
          </div>

          <div className="p-4 border rounded-md shadow-sm">
            <Label htmlFor="command" className="block text-sm font-medium text-foreground">Enter Command:</Label>
            <div className="flex items-center space-x-2 mt-1">
              <Input
                id="command"
                placeholder="Enter a command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="flex-grow"
                disabled={isPort1Busy || isPort2Busy || isBusy}
              />
              <RadioGroup value={selectedCommandPort} onValueChange={(value: 'COM3' | 'COM6') => setSelectedCommandPort(value)} className="flex items-center">
                <div className="flex items-center space-x-1"><RadioGroupItem value="COM3" id="r_com3" /><Label htmlFor="r_com3" className="text-xs">COM3</Label></div>
                <div className="flex items-center space-x-1"><RadioGroupItem value="COM6" id="r_com6" /><Label htmlFor="r_com6" className="text-xs">COM6</Label></div>
              </RadioGroup>
            </div>
            <Button onClick={handleAddCommand} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy}>Add Command to Queue</Button>
          </div>
        </div>


        {commands.length > 0 && (
          <div className="w-full mt-4 h-[200px] overflow-y-auto border rounded-md shadow-sm"> 
            <Table>
              <TableCaption>List of commands in queue</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px] sticky top-0 bg-card z-10">Resp</TableHead>
                  {["Vi", "Ii", "Pi", "Vo", "Io", "Po", "Eff"].map((label, i) => (<TableHead key={`data-header-${i}`} className="w-[80px] sticky top-0 bg-card z-10">{label}</TableHead>))}
                  <TableHead className="min-w-[150px] sticky top-0 bg-card z-10">Command</TableHead>
                  <TableHead className="w-[70px] sticky top-0 bg-card z-10">Port</TableHead>
                  <TableHead className="w-[90px] sticky top-0 bg-card z-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((cmdInfo, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 8 }).map((_, cellIndex) => (
                      <TableCell key={`cell-${index}-${cellIndex}`} className="p-1">
                        <Input 
                          type="text" 
                          value={commandResponses[index * 8 + cellIndex] || ''} 
                          readOnly 
                          className={`h-8 text-xs ${cellIndex === 0 ? "w-[95px]" : "w-[75px]"}`} 
                        />
                      </TableCell>
                    ))}
                    <TableCell className="truncate text-xs p-1" style={{ maxWidth: '150px' }}>{cmdInfo.text}</TableCell>
                    <TableCell className="text-xs p-1">{cmdInfo.targetPort}</TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveCommand(index)}
                        disabled={isBusy || isPort1Busy || isPort2Busy}
                        className="h-8 px-2 text-xs" 
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Button onClick={handleSendMultipleCommands} className="w-full" disabled={(!isConnected1 && !isConnected2) || isBusy || isPort1Busy || isPort2Busy || commands.length === 0}>
          {isBusy ? 'Sending Commands...' : 'Send All Commands from Queue'}
        </Button>

        {chartData.length > 0 && Object.keys(chartConfig).length > 0 && (
          <Card id="efficiency-chart-card" className="w-full mt-4 shadow-sm"> 
            <div className="flex justify-end p-2">
              <Button onClick={handleCaptureChart} size="sm">Capture Plot</Button>
            </div>
            <CardHeader>
              <CardTitle>Efficiency vs. Output Power</CardTitle>
              <CardDescription>Efficiency curves at different input voltages (Eff = Po/Pi)</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                <LineChart data={chartData} margin={{ top: 5, right: 100, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="po"
                    type="number"
                    name="Output Power (Po)"
                    label={{ value: "Output Power (Po) (W)", position: "insideBottom", offset: -15 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(value) => value.toFixed(1)}
                    allowDuplicatedCategory={false}
                  />
                  <YAxis
                    name="Efficiency (Eff)"
                    label={{ value: "Efficiency (Eff)", angle: -90, position: "insideLeft" }}
                    domain={[0, 'auto']}
                    tickFormatter={(value) => value.toFixed(3)}
                  />
                  <ChartTooltip
                    cursor={true}
                    content={<ChartTooltipContent
                      labelFormatter={(value, payload) => `Po: ${Number(payload?.[0]?.payload?.po || value).toFixed(2)} W`}
                      formatter={(value, name, props) => {
                        const label = chartConfig[name as string]?.label || name;
                        return [(value as number).toFixed(3), label];
                      }}
                    />}
                  />
                  {Object.keys(chartConfig).map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={chartConfig[key]?.color}
                      strokeWidth={2}
                      dot={false}
                      name={chartConfig[key]?.label}
                      connectNulls
                    />
                  ))}
                  <ChartLegend
                    content={<ChartLegendContent />}
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
        
          {showUserInfoForm && (
          <div className="mt-8 p-6 border rounded-md shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Enter Your Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
                <Input id="name" placeholder="Your Name" value={userName} onChange={(e) => setUserName(e.target.value)} required />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                <Input id="email" type="email" placeholder="Your Email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="company">Company</Label>
                <Input id="company" placeholder="Your Company" value={userCompany} onChange={(e) => setUserCompany(e.target.value)} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" placeholder="Your Industry" value={userIndustry} onChange={(e) => setUserIndustry(e.target.value)} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" type="tel" placeholder="Your Phone Number" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={handleClientSendEmail} disabled={isSendingEmail || !userName || !userEmail}>
                {isSendingEmail ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </div>
        )}
  
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button onClick={handleActivatePort1} variant="outline" className="w-full" disabled={isPort1Busy || isBusy}>
            {isPort1Busy ? (isConnected1 ? 'Disconnecting COM3...' : 'Connecting COM3...') : (isConnected1 ? 'Deactivate COM3 Port' : 'Activate COM3 Port')}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
          <Button onClick={handleActivatePort2} variant="outline" className="w-full" disabled={isPort2Busy || isBusy}>
            {isPort2Busy ? (isConnected2 ? 'Disconnecting COM6...' : 'Connecting COM6...') : (isConnected2 ? 'Deactivate COM6 Port' : 'Activate COM6 Port')}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div>
          <Label htmlFor="response" className="block text-sm font-medium text-foreground">Response Log:</Label>
          <Textarea 
            ref={responseLogRef} 
            id="response" 
            placeholder="Response log will be displayed here" 
            value={response ? response + String.fromCharCode(160) : String.fromCharCode(160)}
            readOnly 
            className="mt-1 h-24 resize-none text-xs bg-black text-white font-mono" 
          />
        </div>
      </div>
    </div>
  );
}

