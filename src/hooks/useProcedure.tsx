'use client';

import { useState } from 'react';

interface QueuedCommand {
  text: string;
  targetPort: 'COM3' | 'COM6';
  meta?: { calculatesPo?: boolean; calculatesPi?: boolean };
}

interface ProcedureGenerationResult {
  commands: QueuedCommand[];
  error?: string;
}

export function useProcedure(
  viMinDefault?: string, 
  viMaxDefault?: string,
  nominalPowerDefault?: string,
  voNominalDefault?: string
) {
  const [procedureText, setProcedureText] = useState('');
  // selectedProcedurePort and setSelectedProcedurePort are removed

  const generateCommandsFromProcedure = (): ProcedureGenerationResult => {
    const procText = procedureText.trim();
    const swVinMatch = procText.match(/^SwVin\(([^,]*),([^,]*),([^)]*)\)$/i);
    const swIoMatch = procText.match(/^SwIo\(([^,]*),([^,]*),([^)]*)\)$/i);
    const poutMatch = procText.match(/^Pout\(([^)]*)\)$/i);
    const pinMatch = procText.match(/^Pin\(([^)]*)\)$/i);

    if (swVinMatch) {
      const vs1Str = swVinMatch[1].trim();
      const vs2Str = swVinMatch[2].trim();
      const nswStr = swVinMatch[3].trim();
      let vs1: number, vs2: number;
      if (vs1Str === '' && viMinDefault && viMinDefault.trim() !== '') vs1 = parseFloat(viMinDefault); else vs1 = parseFloat(vs1Str);
      if (vs2Str === '' && viMaxDefault && viMaxDefault.trim() !== '') vs2 = parseFloat(viMaxDefault); else vs2 = parseFloat(vs2Str);
      if (isNaN(vs1) || isNaN(vs2)) return { commands: [], error: 'SwVin Error: Vs1 or Vs2 is invalid or defaults not set.' };
      let nsw = nswStr === '' ? 2 : parseInt(nswStr, 10);
      if (isNaN(nsw) || nsw < 2) nsw = 2;
      if (nsw > 20) nsw = 20;
      const generatedCommands: QueuedCommand[] = [];
      for (let i = 0; i < nsw; i++) {
        const t = (nsw === 1) ? 0 : i / (nsw - 1);
        const vx = vs1 + t * (vs2 - vs1);
        generatedCommands.push({ text: `VOLT ${vx.toFixed(2)}`, targetPort: 'COM3' });
        generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM3' });
        generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM6' });
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3' });
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6' });
      }
      return { commands: generatedCommands };
    } else if (swIoMatch) {
      const is1Str = swIoMatch[1].trim();
      const is2Str = swIoMatch[2].trim();
      const nswStr = swIoMatch[3].trim();
      let is1: number, is2: number;
      if (is1Str === '') is1 = 0; else is1 = parseFloat(is1Str);
      if (is2Str === '') {
        const nomP = parseFloat(nominalPowerDefault || '');
        const voN = parseFloat(voNominalDefault || '');
        if (isNaN(nomP) || isNaN(voN) || voN === 0) return { commands: [], error: 'SwIo Error: Cannot calc default Is2. Nominal Power/Vo Nominal invalid or Vo is zero.' };
        is2 = nomP / voN;
      } else is2 = parseFloat(is2Str);
      if (isNaN(is1) || isNaN(is2)) return { commands: [], error: 'SwIo Error: Is1 or Is2 invalid.' };
      let nsw = nswStr === '' ? 2 : parseInt(nswStr, 10);
      if (isNaN(nsw) || nsw < 2) nsw = 2;
      if (nsw > 20) nsw = 20;
      const generatedCommands: QueuedCommand[] = [];
      for (let i = 0; i < nsw; i++) {
        const t = (nsw === 1) ? 0 : i / (nsw - 1);
        const ix = is1 + t * (is2 - is1);
        generatedCommands.push({ text: `CURR ${ix.toFixed(2)}`, targetPort: 'COM6' });
        generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM3' });
        generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM6' });
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3' });
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6' });
      }
      return { commands: generatedCommands };
    } else if (poutMatch) {
      const isStr = poutMatch[1].trim();
      const generatedCommands: QueuedCommand[] = [];
      if (isStr !== '') {
        const isValue = parseFloat(isStr);
        if (isNaN(isValue)) return { commands: [], error: 'Pout Error: Is parameter must be a valid number if provided.' };
        generatedCommands.push({ text: `CURR ${isValue.toFixed(2)}`, targetPort: 'COM6' });
      }
      generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM6' });
      generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6', meta: { calculatesPo: true } });
      return { commands: generatedCommands };
    } else if (pinMatch) {
      const vsStr = pinMatch[1].trim();
      const generatedCommands: QueuedCommand[] = [];
      if (vsStr !== '') {
        const vsValue = parseFloat(vsStr);
        if (isNaN(vsValue)) return { commands: [], error: 'Pin Error: Vs parameter must be a valid number if provided.' };
        const viMin = parseFloat(viMinDefault || '');
        const viMax = parseFloat(viMaxDefault || '');
        if (isNaN(viMin) || isNaN(viMax)) {
          return { commands: [], error: 'Pin Error: Vi(min) or Vi(max) not set or invalid in User Parameters. Required for Vs validation.' };
        }
        if (vsValue < viMin || vsValue > viMax) {
          return { commands: [], error: `Pin Error: Vs (${vsValue}) out of range [${viMin}, ${viMax}].` };
        }
        generatedCommands.push({ text: `VOLT ${vsValue.toFixed(2)}`, targetPort: 'COM3' });
      }
      generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM3' });
      generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3', meta: { calculatesPi: true } });
      return { commands: generatedCommands };
    } else if (procText) {
      // If procText is not empty but doesn't match any known procedure, return an error.
      return { 
        commands: [], 
        error: `Unrecognized procedure: "${procText}". Please use a defined procedure (e.g., SwVin, Pin) or the 'Enter Command' section for individual commands.` 
      };
    }
    // No text, no commands, no error
    return { commands: [] };
  };

  return {
    procedureText,
    setProcedureText,
    // selectedProcedurePort and setSelectedProcedurePort are removed from return
    generateCommandsFromProcedure,
  };
}
