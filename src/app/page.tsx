"use client";
/// <reference lib="dom" />

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plug } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useComPort } from '../hooks/useComPort';

interface QueuedCommand {
  text: string;
  targetPort: 'COM3' | 'COM6';
}

async function sendAndRead(
  port: SerialPort | null,
  commandToSend: string,
  responseUpdater: React.Dispatch<React.SetStateAction<string>>,
  timeoutMs: number = 2000,
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
          setTimeout(() => reject(new Error(`Read operation timed out after ${timeLeft}ms delay`)), timeLeft);
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
        if (incomingData.length > 0) {
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
  // Existing state
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [commands, setCommands] = useState<QueuedCommand[]>([]);
  const [selectedCommandPort, setSelectedCommandPort] = useState<'COM3' | 'COM6'>('COM3');
  const [isBusy, setIsBusy] = useState(false);
  const [isPort1Busy, setIsPort1Busy] = useState(false);
  const [isPort2Busy, setIsPort2Busy] = useState(false);
  const [commandResponses, setCommandResponses] = useState<string[]>([]);

  // New state for user parameters
  const [nominalPower, setNominalPower] = useState('');
  const [viMin, setViMin] = useState('');
  const [viMax, setViMax] = useState('');
  const [voNominal, setVoNominal] = useState('');

  const { port1, isConnected1, activatePort1, port2, isConnected2, activatePort2 } = useComPort({
    setIsBusy: setIsBusy,
    setResponse,
    setCommandResponses,
    sendAndRead, 
  });

  const handleAddCommand = () => {
    if (!command.trim()) {
      setResponse(prev => prev + `${String.fromCharCode(10)}Please enter a command to send.`);
      return;
    }
    setCommands(prevCommands => [...prevCommands, { text: command, targetPort: selectedCommandPort }]);
    setCommandResponses(prevResponses => [...prevResponses, ...Array(8).fill('')]);
    setCommand('');
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
    setIsBusy(true);
    const updatedResponses = [...commandResponses];

    for (let i = 0; i < commands.length; i++) {
      const cmdInfo = commands[i];
      let targetPortSerial: SerialPort | null = null;
      let targetPortName: string = '';

      if (cmdInfo.targetPort === 'COM3') {
        if (isConnected1 && port1) {
          targetPortSerial = port1;
          targetPortName = 'COM3';
        } else {
          setResponse(prev => prev + `${String.fromCharCode(10)}Skipping command "${cmdInfo.text}": COM3 not active.`);
          updatedResponses[i * 8] = 'Skipped (COM3 inactive)';
          setCommandResponses([...updatedResponses]); 
          continue; 
        }
      } else { 
        if (isConnected2 && port2) {
          targetPortSerial = port2;
          targetPortName = 'COM6';
        } else {
          setResponse(prev => prev + `${String.fromCharCode(10)}Skipping command "${cmdInfo.text}": COM6 not active.`);
          updatedResponses[i * 8] = 'Skipped (COM6 inactive)';
          setCommandResponses([...updatedResponses]); 
          continue; 
        }
      }
      
      setResponse(prev => prev + `${String.fromCharCode(10)}Sending to ${targetPortName}: "${cmdInfo.text}"`);
      try {
        const cmdResponse = await sendAndRead(targetPortSerial, cmdInfo.text, setResponse);
        updatedResponses[i * 8] = cmdResponse;

        if (cmdInfo.text.endsWith('?')) {
          const parts = cmdResponse.split(',').map(p => p.trim());
          if (cmdInfo.targetPort === 'COM3') {
            switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) updatedResponses[i * 8 + 1] = parts[0]; // Vi
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) updatedResponses[i * 8 + 2] = parts[0]; // Ii
                break;
              case 'MEAS:POW?':
                if (parts.length > 0) updatedResponses[i * 8 + 3] = parts[0]; // Pi
                break;
              case 'MEAS:ALL?':
                if (parts.length > 0) updatedResponses[i * 8 + 1] = parts[0]; // Vi
                if (parts.length > 1) updatedResponses[i * 8 + 2] = parts[1]; // Ii
                if (parts.length > 2) updatedResponses[i * 8 + 3] = parts[2]; // Pi
                break;
            }
          } else if (cmdInfo.targetPort === 'COM6') {
            switch (cmdInfo.text) {
              case 'MEAS:VOLT?':
                if (parts.length > 0) updatedResponses[i * 8 + 4] = parts[0]; // Vo
                break;
              case 'MEAS:CURR?':
                if (parts.length > 0) updatedResponses[i * 8 + 5] = parts[0]; // Io
                break;
              case 'MEAS:POW?':
                if (parts.length > 0) updatedResponses[i * 8 + 6] = parts[0]; // Po
                break;
              case 'MEAS:ALL?':
                if (parts.length > 0) updatedResponses[i * 8 + 4] = parts[0]; // Vo
                if (parts.length > 1) updatedResponses[i * 8 + 5] = parts[1]; // Io
                if (parts.length > 2) updatedResponses[i * 8 + 6] = parts[2]; // Po
                break;
            }
          }
        }
      } catch (error) {
        updatedResponses[i * 8] = 'Error';
        for (let k = 1; k < 8; k++) {
          updatedResponses[i * 8 + k] = ''; 
        }
      }
      setCommandResponses([...updatedResponses]); 
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    setIsBusy(false);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0</h1>
      
      {/* New section for User Parameters */}
      <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 border rounded-md">
        <div>
          <Label htmlFor="nominalPower" className="block text-sm font-medium text-foreground mb-1">Nominal Power (W)</Label>
          <Input
            id="nominalPower"
            type="number" // Use type number for numeric input
            placeholder="e.g., 100"
            value={nominalPower}
            onChange={(e) => setNominalPower(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="viMin" className="block text-sm font-medium text-foreground mb-1">Vi (min) (V)</Label>
          <Input
            id="viMin"
            type="number"
            placeholder="e.g., 9"
            value={viMin}
            onChange={(e) => setViMin(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="viMax" className="block text-sm font-medium text-foreground mb-1">Vi (Max) (V)</Label>
          <Input
            id="viMax"
            type="number"
            placeholder="e.g., 36"
            value={viMax}
            onChange={(e) => setViMax(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="voNominal" className="block text-sm font-medium text-foreground mb-1">Vo (Nominal) (V)</Label>
          <Input
            id="voNominal"
            type="number"
            placeholder="e.g., 12"
            value={voNominal}
            onChange={(e) => setVoNominal(e.target.value)}
          />
        </div>
      </div>

      {/* Existing UI sections */}
      <div className="w-full space-y-4">
        {/* Command Input Section */}
        <div>
          <Label htmlFor="command" className="block text-sm font-medium text-foreground">
            Enter Command:
          </Label>
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
                <RadioGroupItem value="COM3" id="com3" />
                <Label htmlFor="com3">COM3</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="COM6" id="com6" />
                <Label htmlFor="com6">COM6</Label>
              </div>
            </RadioGroup>
          </div>
          <Button onClick={handleAddCommand} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy}>
            Add Command to Queue
          </Button>
        </div>

        {/* Command Queue Table */}
        {commands.length > 0 && (
          <div className="w-full mt-4">
            <Table>
              <TableCaption>List of commands in queue</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Resp</TableHead>
                  {["Vi", "Ii", "Pi", "Vo", "Io", "Po", "Eff"].map((label, i) => (
                    <TableHead key={`data-header-${i}`} className="w-[75px]">{label}</TableHead> 
                  ))}
                  <TableHead className="w-[120px]">Command</TableHead>
                  <TableHead className="w-[70px]">Port</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((cmdInfo, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 8 }).map((_, cellIndex) => (
                      <TableCell key={`cell-${index}-${cellIndex}`}>
                        <Input 
                          type="text" 
                          value={commandResponses[index * 8 + cellIndex] || ''} 
                          readOnly 
                          className={cellIndex === 0 ? "w-[90px]" : "w-[75px]"} 
                        />
                      </TableCell>
                    ))}
                    <TableCell className="truncate" style={{ maxWidth: '120px' }}>{cmdInfo.text}</TableCell>
                    <TableCell>{cmdInfo.targetPort}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Send Button */}
        <Button onClick={handleSendMultipleCommands} className="mt-2 w-full" disabled={(!isConnected1 && !isConnected2) || isBusy || isPort1Busy || isPort2Busy}>
          {isBusy ? 'Sending Commands...' : 'Send All Commands from Queue'}
        </Button>

        {/* Activation Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={handleActivatePort1}
            variant="outline"
            className="w-full"
            disabled={isPort1Busy || isPort2Busy || (isConnected2 && !isConnected1) || isBusy}
          >
            {isPort1Busy ? (isConnected1 ? 'Disconnecting COM3...' : 'Connecting COM3...') : (isConnected1 ? 'Deactivate COM3 Port' : 'Activate COM3 Port')}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
          <Button
            onClick={handleActivatePort2}
            variant="outline"
            className="w-full"
            disabled={isPort2Busy || isPort1Busy || (isConnected1 && !isConnected2) || isBusy}
          >
            {isPort2Busy ? (isConnected2 ? 'Disconnecting COM6...' : 'Connecting COM6...') : (isConnected2 ? 'Deactivate COM6 Port' : 'Activate COM6 Port')}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {/* Response Log */}
        <div>
          <Label htmlFor="response" className="block text-sm font-medium text-foreground">
            Response Log:
          </Label>
          <Textarea
            id="response"
            placeholder="Response log will be displayed here"
            value={response} 
            readOnly
            className="mt-1 h-60 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
