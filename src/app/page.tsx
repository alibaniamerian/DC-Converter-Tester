"use client";
/// <reference lib="dom" />

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plug, Trash2 } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useComPort } from '../hooks/useComPort';
import { useProcedure } from '../hooks/useProcedure';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'; // Added recharts imports
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card"; // Added Card imports for styling
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent
} from "@/components/ui/chart"; // Added Chart components

interface QueuedCommand {
  text: string;
  targetPort: 'COM3' | 'COM6';
  meta?: { calculatesPo?: boolean; calculatesPi?: boolean; calculatesEff?: boolean };
}

interface EffPoDataPoint {
  po: number;
  eff: number;
}

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
    responseUpdater(prev => prev + `Sending: "${commandToSend}"${expectResponse ? '...' : ' (No Response Expected)'}`);
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
          readerDone = true; break;
        }
        if (value) {
          const decodedChunk = new TextDecoder().decode(value);
          incomingData += decodedChunk;
          if (incomingData.includes(responseDelimiter)) {
            readerDone = true; break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Timeout: No data received')) throw error;
        if (incomingData.length > 0 && !(error instanceof Error && error.message.includes('timed out after'))) {
            readerDone = true; break;
        } else {
            throw error;
        }
      }
    }
    responseData = incomingData.trim();
    responseUpdater(prev => prev + `${String.fromCharCode(10)}Response: ${responseData}`);
    return responseData;
  } catch (error: any) {
    responseUpdater(prev => prev + `${String.fromCharCode(10)}Error during send/read for "${commandToSend}": ${error.message}`);
    throw error;
  } finally {
    if (reader?.releaseLock) { try { await reader.cancel(); } catch (_) { } reader.releaseLock(); }
    if (writer?.releaseLock) { writer.releaseLock(); }
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
  const [effPoChartData, setEffPoChartData] = useState<EffPoDataPoint[]>([]); // State for chart data

  // User Parameters State
  const [nominalPower, setNominalPower] = useState('');
  const [viMin, setViMin] = useState('');
  const [viMax, setViMax] = useState('');
  const [voNominal, setVoNominal] = useState('');
  const [userTimeout, setUserTimeout] = useState<string>('');

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
    if (procedureCommands.length === 0 && !procedureText.trim()){
      setResponse(prev => prev + `${String.fromCharCode(10)}Please enter a procedure to add.`);
      return;
    }
    if (procedureCommands.length === 0 && procedureText.trim()) {
        setResponse(prev => prev + `${String.fromCharCode(10)}Procedure not recognized or generated no commands. Supported: SwVin, SwIo, Pout(Is), Pin(Vs), SwPo.`);
        return;
    }
    if (procedureCommands.length > 0) {
        setCommands(prevCommands => [...prevCommands, ...procedureCommands]);
        setCommandResponses(prevResponses => [
          ...prevResponses, 
          ...Array(procedureCommands.length * 8).fill('')
        ]);
        setProcedureText('');
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
    setIsPort1Busy(true); await activatePort1({}); setIsPort1Busy(false);
  };

  const handleActivatePort2 = async () => {
    setIsPort2Busy(true); await activatePort2({}); setIsPort2Busy(false);
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
    let tempUpdatedResponses = [...commandResponses];
    const newChartData: EffPoDataPoint[] = []; // Initialize chart data collector

    for (let i = 0; i < commands.length; i++) {
      const cmdInfo = commands[i];
      let targetPortSerial: SerialPort | null = null;
      let targetPortName: string = '';

      if (cmdInfo.targetPort === 'COM3') {
        if (isConnected1 && port1) { targetPortSerial = port1; targetPortName = 'COM3'; }
        else { 
          setResponse(prev => prev + `${String.fromCharCode(10)}Skipping cmd "${cmdInfo.text}": COM3 not active.`);
          tempUpdatedResponses[i * 8] = 'Skipped (COM3 inactive)'; 
          setCommandResponses([...tempUpdatedResponses]); 
          continue; 
        }
      } else { // COM6
        if (isConnected2 && port2) { targetPortSerial = port2; targetPortName = 'COM6'; }
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
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 1] = parts[0]; // Vi
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 2] = parts[0]; // Ii
                if (cmdInfo.meta?.calculatesPi) {
                  let prevViStr = '';
                  for (let k = i - 1; k >= 0; k--) {
                    if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM3') {
                      prevViStr = tempUpdatedResponses[k * 8 + 1];
                      break;
                    }
                  }
                  const prevVi = parseFloat(prevViStr);
                  const currentIi = parseFloat(parts[0]); 
                  if (!isNaN(prevVi) && !isNaN(currentIi)) {
                    tempUpdatedResponses[i * 8 + 3] = (prevVi * currentIi).toFixed(2); // Pi
                  }
                }
                break;
              case 'MEAS:POW?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 3] = parts[0]; // Pi
                break;
              case 'MEAS:ALL?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 1] = parts[0]; // Vi
                if (parts.length > 1) tempUpdatedResponses[i * 8 + 2] = parts[1]; // Ii
                if (parts.length > 2) tempUpdatedResponses[i * 8 + 3] = parts[2]; // Pi
                break;
            }
          } else if (cmdInfo.targetPort === 'COM6') {
            switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 4] = parts[0]; // Vo
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 5] = parts[0]; // Io
                let poVal: number | undefined = undefined;
                if (cmdInfo.meta?.calculatesPo) {
                  let prevVoStr = '';
                  for (let k = i - 1; k >= 0; k--) {
                    if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM6') {
                      prevVoStr = tempUpdatedResponses[k * 8 + 4];
                      break;
                    }
                  }
                  const prevVo = parseFloat(prevVoStr); 
                  const currentIo = parseFloat(parts[0]); 
                  if (!isNaN(prevVo) && !isNaN(currentIo)) {
                    poVal = parseFloat((prevVo * currentIo).toFixed(2));
                    tempUpdatedResponses[i * 8 + 6] = poVal.toString(); // Po
                  }
                }
                if (cmdInfo.meta?.calculatesEff) {
                  let prevViStr = '';
                  let prevVoStrPo = ''; 
                  for (let k = i - 1; k >= 0; k--) {
                    if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM3') {
                      prevViStr = tempUpdatedResponses[k * 8 + 1]; 
                    }
                    if (commands[k].text === 'MEAS:VOLT?' && commands[k].targetPort === 'COM6') {
                      prevVoStrPo = tempUpdatedResponses[k * 8 + 4];
                    }
                    if (prevViStr && prevVoStrPo) break; 
                  }
                  const prevVi = parseFloat(prevViStr);
                  const prevVo = parseFloat(prevVoStrPo);
                  let effVal: number | undefined = undefined;
                  if (!isNaN(prevVi) && !isNaN(prevVo) && prevVi !== 0) {
                    effVal = parseFloat((prevVo / prevVi).toFixed(3));
                    tempUpdatedResponses[i * 8 + 7] = effVal.toString(); // Eff
                  }
                  // Collect data for chart
                  if (poVal !== undefined && effVal !== undefined) {
                    newChartData.push({ po: poVal, eff: effVal });
                  }
                }
                break;
              case 'MEAS:POW?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 6] = parts[0]; // Po
                break;
              case 'MEAS:ALL?':
                if (parts.length > 0) tempUpdatedResponses[i * 8 + 4] = parts[0]; // Vo
                if (parts.length > 1) tempUpdatedResponses[i * 8 + 5] = parts[1]; // Io
                if (parts.length > 2) tempUpdatedResponses[i * 8 + 6] = parts[2]; // Po
                break;
            }
          }
        }
      } catch (error) {
        tempUpdatedResponses[i * 8] = 'Error';
        for (let k = 1; k < 8; k++) tempUpdatedResponses[i * 8 + k] = ''; 
      }
      setCommandResponses([...tempUpdatedResponses]); 
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    // Sort data by Po for correct line chart rendering
    newChartData.sort((a, b) => a.po - b.po);
    setEffPoChartData(newChartData);
    setIsBusy(false);
  };

  const chartConfig = {
    eff: {
      label: "Efficiency",
      color: "hsl(var(--chart-1))",
    },
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0</h1>
      
      <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 border rounded-md">
        <div>
          <Label htmlFor="nominalPower" className="block text-sm font-medium text-foreground mb-1">Nominal Power (W)</Label>
          <Input id="nominalPower" type="number" placeholder="e.g., 100" value={nominalPower} onChange={(e) => setNominalPower(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="viMin" className="block text-sm font-medium text-foreground mb-1">Vi (min) (V)</Label>
          <Input id="viMin" type="number" placeholder="e.g., 9" value={viMin} onChange={(e) => setViMin(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="viMax" className="block text-sm font-medium text-foreground mb-1">Vi (Max) (V)</Label>
          <Input id="viMax" type="number" placeholder="e.g., 36" value={viMax} onChange={(e) => setViMax(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="voNominal" className="block text-sm font-medium text-foreground mb-1">Vo (Nominal) (V)</Label>
          <Input id="voNominal" type="number" placeholder="e.g., 12" value={voNominal} onChange={(e) => setVoNominal(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="userTimeout" className="block text-sm font-medium text-foreground mb-1">Cmd Timeout (ms)</Label>
          <Input 
            id="userTimeout" 
            type="number" 
            placeholder="e.g., 2000 (default 1000)" 
            value={userTimeout} 
            onChange={(e) => setUserTimeout(e.target.value)} 
          />
        </div>
      </div>

      <div className="w-full space-y-4">
        <div>
          <Label htmlFor="procedure" className="block text-sm font-medium text-foreground">Enter Procedure:</Label>
          <div className="flex items-center space-x-4 mt-1">
            <Input
              id="procedure"
              placeholder="e.g., SwVin(10,20,5), Pin(12), Pout(), SwPo(10,50,5)"
              value={procedureText}
              onChange={(e) => setProcedureText(e.target.value)}
              className="flex-grow"
              disabled={isPort1Busy || isPort2Busy || isBusy}
            />
          </div>
          <Button onClick={handleAddProcedureToQueue} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy}>
            Add Procedure to Queue
          </Button>
        </div>

        <div>
          <Label htmlFor="command" className="block text-sm font-medium text-foreground">Enter Command:</Label>
          <div className="flex items-center space-x-4 mt-1">
            <Input
              id="command"
              placeholder="Enter a command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="flex-grow"
              disabled={isPort1Busy || isPort2Busy || isBusy}
            />
            <RadioGroup defaultValue="COM3" value={selectedCommandPort} onValueChange={(value: 'COM3' | 'COM6') => setSelectedCommandPort(value)} className="flex items-center">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="COM3" id="com3" /><Label htmlFor="com3">COM3</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="COM6" id="com6" /><Label htmlFor="com6">COM6</Label>
              </div>
            </RadioGroup>
          </div>
          <Button onClick={handleAddCommand} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy}>Add Command to Queue</Button>
        </div>

        {commands.length > 0 && (
          <div className="w-full mt-4">
            <Table>
              <TableCaption>List of commands in queue</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Resp</TableHead>
                  {["Vi", "Ii", "Pi", "Vo", "Io", "Po", "Eff"].map((label, i) => (<TableHead key={`data-header-${i}`} className="w-[75px]">{label}</TableHead>))}
                  <TableHead className="w-[120px]">Command</TableHead>
                  <TableHead className="w-[70px]">Port</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((cmdInfo, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 8 }).map((_, cellIndex) => (
                      <TableCell key={`cell-${index}-${cellIndex}`}>
                        <Input type="text" value={commandResponses[index * 8 + cellIndex] || ''} readOnly className={cellIndex === 0 ? "w-[90px]" : "w-[75px]"} />
                      </TableCell>
                    ))}
                    <TableCell className="truncate" style={{ maxWidth: '120px' }}>{cmdInfo.text}</TableCell>
                    <TableCell>{cmdInfo.targetPort}</TableCell>
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveCommand(index)}
                        disabled={isBusy || isPort1Busy || isPort2Busy}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Button onClick={handleSendMultipleCommands} className="mt-2 w-full" disabled={(!isConnected1 && !isConnected2) || isBusy || isPort1Busy || isPort2Busy || commands.length === 0}>
          {isBusy ? 'Sending Commands...' : 'Send All Commands from Queue'}
        </Button>

        {/* Chart Display Area */}
        {effPoChartData.length > 0 && (
          <Card className="w-full mt-4">
            <CardHeader>
              <CardTitle>Efficiency vs. Output Power</CardTitle>
              <CardDescription>Eff = Vo / Vi, Po = Vo * Io</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                <LineChart data={effPoChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="po" 
                    type="number" 
                    name="Output Power (Po)"
                    unit="W"
                    domain={['auto', 'auto']}
                    tickFormatter={(value) => value.toFixed(1)}
                  />
                  <YAxis 
                    dataKey="eff" 
                    name="Efficiency (Eff)"
                    domain={[0, 'auto']} // Eff typically 0 to 1 or 1.x for >100%
                    tickFormatter={(value) => value.toFixed(3)}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent hideLabel />} 
                    formatter={(value, name, props) => [
                      `${(value as number).toFixed(3)} (${name === 'eff' ? 'Eff' : 'Po'})`,
                       name === 'eff' ? `Po: ${(props.payload?.po as number).toFixed(2)}W` : `Eff: ${(props.payload?.eff as number).toFixed(3)}`
                    ]}
                   />
                  <Line type="monotone" dataKey="eff" stroke={chartConfig.eff.color} strokeWidth={2} dot={false} name="Efficiency"/>
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4">
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
          <Textarea id="response" placeholder="Response log will be displayed here" value={response} readOnly className="mt-1 h-60 resize-none" />
        </div>
      </div>
    </div>
  );
}
