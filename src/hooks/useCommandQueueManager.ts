
"use client";

import { useState, useCallback } from 'react';
import type { QueuedCommand } from './useCommandExecutor'; // Ensure QueuedCommand is defined/exported consistently

// Define DeviceProcedureParams and ProcedureListItem if not imported from elsewhere
// These types are based on their usage in the original page.tsx
interface DeviceProcedureParams {
  viMin: string;
  viMax: string;
  nominalPower: string;
  voNominal: string;
}

interface ProcedureListItem {
  value: string;
  label: string;
  description: string;
  getTemplate: (params: Partial<DeviceProcedureParams>) => string;
}

interface UseCommandQueueManagerProps {
  procedureListItems: ProcedureListItem[];
  deviceParams: DeviceProcedureParams; // Use the full DeviceProcedureParams
  generateCommandsFromProcedure: (procTextToParse: string) => { commands: QueuedCommand[]; procedureName?: string; error?: string }; // Updated signature
  setPageResponse: React.Dispatch<React.SetStateAction<string>>; // For logging to main page response
  setPageCurrentProcedureName: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export interface UseCommandQueueManagerReturn {
  commandInput: string;
  setCommandInput: React.Dispatch<React.SetStateAction<string>>;
  procedureInput: string;
  setProcedureInput: React.Dispatch<React.SetStateAction<string>>;
  selectedPort: 'COM3' | 'COM6';
  setSelectedPort: React.Dispatch<React.SetStateAction<'COM3' | 'COM6'>>;
  selectedProcedureDescription: string | null;
  commands: QueuedCommand[];
  commandResponses: string[];
  addCommandToQueue: () => void;
  addProcedureToQueue: () => void;
  removeCommandFromQueue: (indexToRemove: number) => void;
  clearCommandQueue: () => void; // This will be the function from the hook
  handleProcedureSelection: (value: string) => void;
  setCommands: React.Dispatch<React.SetStateAction<QueuedCommand[]>>;
  setCommandResponses: React.Dispatch<React.SetStateAction<string[]>>;
}

export const useCommandQueueManager = ({
  procedureListItems,
  deviceParams,
  generateCommandsFromProcedure,
  setPageResponse,
  setPageCurrentProcedureName,
}: UseCommandQueueManagerProps): UseCommandQueueManagerReturn => {
  const [commandInput, setCommandInput] = useState('');
  const [procedureInput, setProcedureInput] = useState(''); // This is the source of truth for the procedure string
  const [selectedPort, setSelectedPort] = useState<'COM3' | 'COM6'>('COM3');
  const [selectedProcedureDescription, setSelectedProcedureDescription] = useState<string | null>(null);

  const [commands, setCommands] = useState<QueuedCommand[]>([]);
  const [commandResponses, setCommandResponses] = useState<string[]>([]);

  const addCommandToQueue = useCallback(() => {
    if (!commandInput.trim()) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Please enter a command to send.`);
      return;
    }
    const newCommand: QueuedCommand = { text: commandInput, targetPort: selectedPort };
    setCommands(prev => [...prev, newCommand]);
    setCommandResponses(prev => [...prev, ...Array(8).fill('')]);
    setCommandInput('');
  }, [commandInput, selectedPort, setPageResponse]);

  const addProcedureToQueue = useCallback(() => {
    // Pass the current procedureInput from this hook's state
    const { commands: procedureCommandsGenerated, procedureName, error } = generateCommandsFromProcedure(procedureInput);

    if (error) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Procedure Error: ${error}`);
      setPageCurrentProcedureName(undefined);
      return;
    }
    if (procedureCommandsGenerated.length === 0 && !procedureInput.trim()) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Please enter a procedure to add.`);
      setPageCurrentProcedureName(undefined);
      return;
    }
    if (procedureCommandsGenerated.length === 0 && procedureInput.trim()) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Procedure not recognized or generated no commands: "${procedureInput}"`);
      setPageCurrentProcedureName(undefined);
      return;
    }

    if (procedureCommandsGenerated.length > 0) {
      if (commands.length === 0 || procedureName) {
        setPageCurrentProcedureName(procedureName);
      }
      setCommands(prev => [...prev, ...procedureCommandsGenerated]);
      setCommandResponses(prev => [...prev, ...Array(procedureCommandsGenerated.length * 8).fill('')]);
      // setProcedureInput(''); // Keep the input for review, or clear if preferred. Let's keep for now.
      // setSelectedProcedureDescription(null); // Keep description if input is kept.
    }
  }, [generateCommandsFromProcedure, procedureInput, commands.length, setPageResponse, setPageCurrentProcedureName]);

  const removeCommandFromQueue = useCallback((indexToRemove: number) => {
    setCommands(prev => prev.filter((_, index) => index !== indexToRemove));
    setCommandResponses(prev => {
      const newResp = [...prev];
      newResp.splice(indexToRemove * 8, 8);
      return newResp;
    });
  }, []);

  const clearCommandQueue = useCallback(() => {
    setCommands([]);
    setCommandResponses([]);
    setPageCurrentProcedureName(undefined);
    setPageResponse(prev => prev + `${String.fromCharCode(10)}Command queue cleared.`);
  }, [setPageResponse, setPageCurrentProcedureName]);

  const handleProcedureSelection = useCallback((value: string) => {
    const selectedProc = procedureListItems.find(p => p.value === value);
    if (selectedProc) {
      setProcedureInput(selectedProc.getTemplate(deviceParams));
      setSelectedProcedureDescription(selectedProc.description);
    } else {
      setSelectedProcedureDescription(null);
    }
  }, [procedureListItems, deviceParams]);

  return {
    commandInput, setCommandInput,
    procedureInput, setProcedureInput,
    selectedPort, setSelectedPort,
    selectedProcedureDescription,
    commands,
    commandResponses,
    addCommandToQueue,
    addProcedureToQueue,
    removeCommandFromQueue,
    clearCommandQueue,
    handleProcedureSelection,
    setCommands,
    setCommandResponses,
  };
};
