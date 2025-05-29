
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

// Hooks
import { useComPort } from '../hooks/useComPort';
import { useProcedure } from '../hooks/useProcedure';
import { useEmailSender } from '../hooks/useEmailSender';
import { useDeviceParametersAndModel } from '../hooks/useDeviceParametersAndModel';
import { useCommandExecutor, type QueuedCommand, type ChartDataPoint } from '../hooks/useCommandExecutor';
import { useCommandQueueManager } from '../hooks/useCommandQueueManager';
import { useChartRenderer, type ChartConfig as PageChartConfig } from '../hooks/useChartRenderer.tsx';


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    description: `Sweeps the input voltage (Vin) and takes measurements.\nParameters:\n  Vs1: Starting input voltage (V). Defaults to Vi(min).\n  Vs2: Ending input voltage (V). Defaults to Vi(max).\n  Nsw: Number of sweep steps (2-20). Defaults to 2.`,
    getTemplate: (params: Partial<DeviceProcedureParams>) =>
      `SwVin(${params.viMin || ''}, ${params.viMax || ''}, )`,
  },
  {
    value: 'SwIo',
    label: 'SwIo(Is1, Is2, Nsw)',
    description: `Sweeps the output current (Io) and takes measurements.\nParameters:\n  Is1: Starting output current (A). Defaults to 0.\n  Is2: Ending output current (A). Defaults to (Nominal Power / Vo (Nominal)).\n  Nsw: Number of sweep steps (2-20). Defaults to 2.`,
    getTemplate: (params: Partial<DeviceProcedureParams>) => {
      const nomP = parseFloat(params.nominalPower || '');
      const voN = parseFloat(params.voNominal || '');
      const defaultIs2 = (!isNaN(nomP) && !isNaN(voN) && voN !== 0)
        ? (nomP / voN).toFixed(2)
        : '';
      return `SwIo(, ${defaultIs2}, )`;
    },
  },
  { value: 'Pout', label: 'Pout(Is)', description: `Sets an optional output current Is, measures Vo & Io, then calculates Po.\nParameters:\n  Is: Target output current (A) (optional).`, getTemplate: () => `Pout()`, },
  { value: 'Pin', label: 'Pin(Vs)', description: `Sets an optional input voltage Vs, measures Vi & Ii, then calculates Pi.\nParameters:\n  Vs: Target input voltage (V) (optional, must be within Vi(min)/Vi(max)).`, getTemplate: () => `Pin()`, },
  { value: 'SwPo', label: 'SwPo(Ps1, Ps2, Nsw)', description: `Sweeps output power (Po). Calculates required Io based on Vo (Nominal).\nParameters:\n  Ps1: Starting output power (W). Defaults to 0.\n  Ps2: Ending output power (W). Defaults to Nominal Power.\n  Nsw: Number of sweep steps (2-20). Defaults to 2.`, getTemplate: (params: Partial<DeviceProcedureParams>) => `SwPo(, ${params.nominalPower || ''}, )`, },
  { value: 'SwPoVi', label: 'SwPoVi(Ps1, Ps2, Nsw, Vs1, Vs2, Nswv)', description: `Sweeps Po across a range of Vi. For each Vi step, performs a full SwPo sweep.\nParameters:\n  Ps1, Ps2, Nsw: For inner SwPo sweep (defaults similar to SwPo).\n  Vs1, Vs2, Nswv: For outer Vi sweep (defaults similar to SwVin for Vs1/Vs2).`, getTemplate: (params: Partial<DeviceProcedureParams>) => `SwPoVi(, ${params.nominalPower || ''}, , ${params.viMin || ''}, ${params.viMax || ''}, )`, },
];
async function sendAndRead(
  port: SerialPort | null,
  commandToSend: string,
  responseUpdater: React.Dispatch<React.SetStateAction<string>>,
  timeoutMs: number,
  lineEnding: string = String.fromCharCode(10),
  responseDelimiter: string = String.fromCharCode(10)
): Promise<string> {
  if (!port) { throw new Error('Serial port is not connected.'); }
  const writer = port.writable?.getWriter();
  const reader = port.readable?.getReader();
  if (!writer || !reader) { throw new Error('Failed to acquire port writer or reader.'); }
  const expectResponse = commandToSend.endsWith('?');
  let responseData = '';
  try {
    responseUpdater(prev => prev + `Sending: "${commandToSend}"${lineEnding === String.fromCharCode(10) ? ' (LF)' : ''}${expectResponse ? '...' : ' (No Response Expected)'}`);
    const dataToSend = new TextEncoder().encode(commandToSend + lineEnding);
    await writer.write(dataToSend);
    if (!expectResponse) return "";
    let incomingData = ''; let readerDone = false; const startTime = Date.now();
    while (!readerDone) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeLeft = timeoutMs - (Date.now() - startTime);
        if (timeLeft <= 0) { if (incomingData.length > 0) { readerDone = true; /*@ts-ignore*/ resolve(); } else { reject(new Error(`Timeout: No data received for "${commandToSend}" within ${timeoutMs}ms`)); }}
        else { setTimeout(() => reject(new Error(`Read operation timed out for "${commandToSend}" after ${timeLeft}ms delay`)), timeLeft); }
      });
      const readChunkPromise = reader.read();
      try { /*@ts-ignore*/ const { value, done } = await Promise.race([readChunkPromise, timeoutPromise]);
        if (done) { readerDone = true; break; }
        if (value) { const decodedChunk = new TextDecoder().decode(value); incomingData += decodedChunk; if (incomingData.includes(responseDelimiter)) { readerDone = true; break; }}
      } catch (error) { if (error instanceof Error && error.message.startsWith('Timeout: No data received')) { throw error; } if (incomingData.length > 0 && !(error instanceof Error && error.message.includes('timed out after'))) { readerDone = true; break; } else { throw error; }}
    }
    responseData = incomingData.split(responseDelimiter)[0].trim();
    responseUpdater(prev => prev + `${String.fromCharCode(10)}Response: ${responseData}`);
    return responseData;
  } catch (error: any) { responseUpdater(prev => prev + `${String.fromCharCode(10)}Error during send/read for "${commandToSend}": ${error.message}`); throw error;
  } finally { if (reader?.releaseLock) { try { await reader.cancel(); } catch (_) {} reader.releaseLock(); } if (writer?.releaseLock) { writer.releaseLock(); }}
}

export default function Home() {
 const [response, setResponse] = React.useState('');
 const [isBusy, setIsBusy] = React.useState(false);
  const [isPort1Busy, setIsPort1Busy] = useState(false);
  const [isPort2Busy, setIsPort2Busy] = useState(false);
  const responseLogRef = useRef<HTMLTextAreaElement>(null);
  const [currentProcedureNameForExecutor, setCurrentProcedureNameForExecutor] = useState<string | undefined>(undefined);

  const {
    nominalPower, setNominalPower, viMin, setViMin, viMax, setViMax, voNominal, setVoNominal,
    userTimeout, setUserTimeout, converterModel, setConverterModel, availableModels,
    selectAndLoadModelParams, saveCurrentDeviceParams, deviceParams,
  } = useDeviceParametersAndModel({
    setPageResponse: setResponse,
    setPageIsBusy: setIsBusy,
  });

  const {
    showUserInfoForm, userName, setUserName, userEmail, setUserEmail,
    userCompany, setUserCompany, userIndustry, setUserIndustry, userPhone, setUserPhone,
    isSendingEmail, handleShowUserInfoForm, handleSendEmail,
  } = useEmailSender({ deviceModel: converterModel, nominalPower, viMin, viMax, voNominal });

  const { port1, isConnected1, activatePort1, port2, isConnected2, activatePort2 } = useComPort({
    setIsBusy, setResponse, sendAndRead, setCommandResponses: () => {},
  });

  const [tempProcedureInput, setTempProcedureInput] = useState('');
  const { generateCommandsFromProcedure } = useProcedure(viMin, viMax, nominalPower, voNominal);

  // Initialize useCommandQueueManager first as it provides `procedureInput`
  const {
    commandInput, setCommandInput, procedureInput, setProcedureInput, selectedPort, setSelectedPort, selectedProcedureDescription, commands, commandResponses,
    addCommandToQueue, addProcedureToQueue, removeCommandFromQueue, 
    clearCommandQueue: clearCommandQueueFromManager, // Rename to avoid conflict
    handleProcedureSelection,
    setCommands: setCommandsFromQueueManager, setCommandResponses: setCommandResponsesFromQueueManager,
  } = useCommandQueueManager({
    procedureListItems,
    deviceParams,
    generateCommandsFromProcedure,
    setPageResponse: setResponse,
    // setPageIsChartReady is removed from here
    setPageCurrentProcedureName: setCurrentProcedureNameForExecutor,
  });
  
  // Now initialize useChartRenderer, it can use `procedureInput`
  const {
    setChartData,
    setChartConfig,
    setIsChartReady, // setIsChartReady is defined here
    ChartDisplayComponent,
    triggerChartCapture,
  } = useChartRenderer({
    currentProcedureName: currentProcedureNameForExecutor,
    converterModelForFilename: converterModel,
    procedureInputForFilename: procedureInput, // Now procedureInput is available
    showEmailFormHandler: handleShowUserInfoForm,
    logUpdater: setResponse,
  });

  // Wrapper for clearCommandQueue to also manage setIsChartReady
  const clearCommandQueue = () => {
    clearCommandQueueFromManager();
    setIsChartReady(false); // Call setIsChartReady from useChartRenderer
  };

  useEffect(() => {
    setTempProcedureInput(procedureInput);
  }, [procedureInput]);

  const { isExecuting, executeAllCommands } = useCommandExecutor({
    commands,
    isConnected1, port1, isConnected2, port2,
    userTimeout,
    currentProcedureName: currentProcedureNameForExecutor,
    sendAndRead,
    setPageResponse: setResponse,
    setCommandResponsesInPage: setCommandResponsesFromQueueManager,
    setChartDataInPage: setChartData,
    setChartConfigInPage: setChartConfig,
    setIsChartReadyInPage: setIsChartReady,
    setIsBusyInPage: setIsBusy,
  });

  useEffect(() => {
    if (responseLogRef.current) {
      responseLogRef.current.scrollTop = responseLogRef.current.scrollHeight;
    }
  }, [response]);


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

  const handleClientSendEmail = async () => {
     const result = await handleSendEmail();
     alert(result.message);
  };
  
  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8 w-full">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0.4</h1>

      <div className="w-full max-w-[80rem] space-y-4">
        <div className="w-full p-4 border rounded-md shadow-sm">
          <Label htmlFor="converterModel" className="block text-sm font-medium text-foreground mb-1">Converter Model</Label>
          <div className="flex items-center gap-2">
             <Input
                id="converterModel"
                placeholder="Enter or select model..."
                value={converterModel}
                onChange={(e) => setConverterModel(e.target.value)}
                disabled={isBusy || isExecuting}
                className="flex-grow"
              />
            <Select
              value={converterModel}
              onValueChange={selectAndLoadModelParams}
              disabled={isBusy || isExecuting}
            >
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
            <Button
              onClick={saveCurrentDeviceParams}
              disabled={isBusy || isExecuting || !converterModel.trim()}
              className="h-10"
            >
              Save Params
            </Button>
          </div>
        </div>
        <div className="w-full p-4 border rounded-md shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-foreground">Device Parameters</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="nominalPower" className="block text-sm font-medium text-foreground mb-1">Nominal Power (W)</Label>
              <Input id="nominalPower" type="number" placeholder="e.g., 100"
                value={nominalPower} onChange={(e) => setNominalPower(e.target.value)}
                disabled={isBusy || isExecuting} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="viMin" className="block text-sm font-medium text-foreground mb-1">Vi (min) (V)</Label>
              <Input id="viMin" type="number" placeholder="e.g., 9"
                value={viMin} onChange={(e) => setViMin(e.target.value)}
                disabled={isBusy || isExecuting} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="viMax" className="block text-sm font-medium text-foreground mb-1">Vi (Max) (V)</Label>
              <Input id="viMax" type="number" placeholder="e.g., 36"
                value={viMax} onChange={(e) => setViMax(e.target.value)}
                disabled={isBusy || isExecuting} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="voNominal" className="block text-sm font-medium text-foreground mb-1">Vo (Nominal) (V)</Label>
              <Input id="voNominal" type="number" placeholder="e.g., 12"
                value={voNominal} onChange={(e) => setVoNominal(e.target.value)}
                disabled={isBusy || isExecuting} className="w-full"/>
            </div>
            <div>
              <Label htmlFor="userTimeout" className="block text-sm font-medium text-foreground mb-1">Cmd Timeout (ms)</Label>
              <Input id="userTimeout" type="number" placeholder="e.g., 1000"
                value={userTimeout} onChange={(e) => setUserTimeout(e.target.value)}
                disabled={isBusy || isExecuting} className="w-full"/>
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
                value={procedureInput}
                onChange={(e) => setProcedureInput(e.target.value)}
                className="flex-grow"
                disabled={isPort1Busy || isPort2Busy || isBusy || isExecuting}
              />
              <Select
                onValueChange={handleProcedureSelection}
                disabled={isPort1Busy || isPort2Busy || isBusy || isExecuting}
              >
                <SelectTrigger className="w-[250px] h-10"> <SelectValue placeholder="Select a procedure..." /> </SelectTrigger>
                <SelectContent>
                  {procedureListItems.map((proc) => ( <SelectItem key={proc.value} value={proc.value}> {proc.label} </SelectItem> ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addProcedureToQueue} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy || isExecuting}>
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
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                className="flex-grow"
                disabled={isPort1Busy || isPort2Busy || isBusy || isExecuting}
              />
              <RadioGroup
                value={selectedPort}
                onValueChange={setSelectedPort}
                className="flex items-center"
              >
                <div className="flex items-center space-x-1"><RadioGroupItem value="COM3" id="r_com3" /><Label htmlFor="r_com3" className="text-xs">COM3</Label></div>
                <div className="flex items-center space-x-1"><RadioGroupItem value="COM6" id="r_com6" /><Label htmlFor="r_com6" className="text-xs">COM6</Label></div>
              </RadioGroup>
            </div>
            <Button onClick={addCommandToQueue} className="mt-2 w-full" disabled={isPort1Busy || isPort2Busy || isBusy || isExecuting}>
              Add Command to Queue
            </Button>
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
                  <TableHead className="w-[120px] sticky top-0 bg-card z-10">Actions</TableHead>
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
                        onClick={() => removeCommandFromQueue(index)}
                        disabled={isBusy || isExecuting || isPort1Busy || isPort2Busy }
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

        <div className="flex flex-col space-y-2">
          <Button
            onClick={executeAllCommands}
            className="w-full"
            disabled={(!isConnected1 && !isConnected2) || isExecuting || isBusy || isPort1Busy || isPort2Busy || commands.length === 0}
          >
            {isExecuting ? 'Sending Commands...' : 'Send All Commands from Queue'}
          </Button>
          <Button
            variant="outline"
            onClick={clearCommandQueue} // Updated to use the wrapper
            className="w-full"
            disabled={commands.length === 0 || isBusy || isExecuting || isPort1Busy || isPort2Busy}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Queue
          </Button>
        </div>
        
        <ChartDisplayComponent />

        {showUserInfoForm && (
          <div className="mt-8 p-6 border rounded-md shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Enter Your Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="nameField">Name <span className="text-red-500">*</span></Label>
                <Input id="nameField" placeholder="Your Name" value={userName} onChange={(e) => setUserName(e.target.value)} required disabled={isSendingEmail} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="emailField">Email <span className="text-red-500">*</span></Label>
                <Input id="emailField" type="email" placeholder="Your Email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required disabled={isSendingEmail} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="companyField">Company</Label>
                <Input id="companyField" placeholder="Your Company" value={userCompany} onChange={(e) => setUserCompany(e.target.value)} disabled={isSendingEmail} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="industryField">Industry</Label>
                <Input id="industryField" placeholder="Your Industry" value={userIndustry} onChange={(e) => setUserIndustry(e.target.value)} disabled={isSendingEmail} />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="phoneField">Phone Number</Label>
                <Input id="phoneField" type="tel" placeholder="Your Phone Number" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} disabled={isSendingEmail} />
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
          <Button onClick={handleActivatePort1} variant="outline" className="w-full" disabled={isPort1Busy || isBusy || isExecuting}>
            {isPort1Busy ? (isConnected1 ? 'Disconnecting COM3...' : 'Connecting COM3...') : (isConnected1 ? 'Deactivate COM3 Port' : 'Activate COM3 Port')}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
          <Button onClick={handleActivatePort2} variant="outline" className="w-full" disabled={isPort2Busy || isBusy || isExecuting}>
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
            className="mt-1 h-48 resize-none text-xs bg-black text-white font-mono"
          />
        </div>
      </div>
    </div>
  );
}
