'use client';

import { useState } from 'react';

interface QueuedCommand {
  text: string;
  targetPort: 'COM3' | 'COM6';
  meta?: { calculatesPo?: boolean; calculatesPi?: boolean; calculatesEff?: boolean };
}

interface ProcedureGenerationResult {
  commands: QueuedCommand[];
  procedureName?: string; // Added to identify the procedure
  error?: string;
}

export function useProcedure(
  viMinDefault?: string, 
  viMaxDefault?: string,
  nominalPowerDefault?: string,
  voNominalDefault?: string
) {
  const [procedureText, setProcedureText] = useState('');

  const generateCommandsFromProcedure = (): ProcedureGenerationResult => {
    const procText = procedureText.trim();
    const swVinMatch = procText.match(/^SwVin\(([^,]*),([^,]*),([^)]*)\)$/i);
    const swIoMatch = procText.match(/^SwIo\(([^,]*),([^,]*),([^)]*)\)$/i);
    const poutMatch = procText.match(/^Pout\(([^)]*)\)$/i);
    const pinMatch = procText.match(/^Pin\(([^)]*)\)$/i);
    const swPoMatch = procText.match(/^SwPo\(([^,]*),([^,]*),([^)]*)\)$/i);
    const swPoViMatch = procText.match(/^SwPoVi\(([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^)]*)\)$/i);

    if (swVinMatch) {
      const vs1Str = swVinMatch[1].trim();
      const vs2Str = swVinMatch[2].trim();
      const nswStr = swVinMatch[3].trim();
      let vs1: number, vs2: number;
      if (vs1Str === '' && viMinDefault && viMinDefault.trim() !== '') vs1 = parseFloat(viMinDefault); else vs1 = parseFloat(vs1Str);
      if (vs2Str === '' && viMaxDefault && viMaxDefault.trim() !== '') vs2 = parseFloat(viMaxDefault); else vs2 = parseFloat(vs2Str);
      if (isNaN(vs1) || isNaN(vs2)) return { commands: [], procedureName: 'SwVin', error: 'SwVin Error: Vs1 or Vs2 is invalid or defaults not set.' };
      let nsw = nswStr === '' ? 2 : parseInt(nswStr, 10);
      if (isNaN(nsw) || nsw < 2) nsw = 2;
      if (nsw > 20) nsw = 20;
      const generatedCommands: QueuedCommand[] = [];
      for (let i = 0; i < nsw; i++) {
        const t = (nsw === 1) ? 0 : i / (nsw - 1);
        const vx = vs1 + t * (vs2 - vs1);
        generatedCommands.push({ text: `VOLT ${vx.toFixed(2)}`, targetPort: 'COM3' });
        generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM3' }); // Vin
        generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM6' }); // Vo
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3', meta: { calculatesPi: true } }); // Iin
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6', meta: { calculatesPo: true, calculatesEff: true } }); // Io, Po, Eff
      }
      return { commands: generatedCommands, procedureName: 'SwVin' };
    } else if (swIoMatch) {
      const is1Str = swIoMatch[1].trim();
      const is2Str = swIoMatch[2].trim();
      const nswStr = swIoMatch[3].trim();
      let is1: number, is2: number;
      if (is1Str === '') is1 = 0; else is1 = parseFloat(is1Str);
      if (is2Str === '') {
        const nomP = parseFloat(nominalPowerDefault || '');
        const voN = parseFloat(voNominalDefault || '');
        if (isNaN(nomP) || isNaN(voN) || voN === 0) return { commands: [], procedureName: 'SwIo', error: 'SwIo Error: Cannot calc default Is2. Nominal Power/Vo Nominal invalid or Vo is zero.' };
        is2 = nomP / voN;
      } else is2 = parseFloat(is2Str);
      if (isNaN(is1) || isNaN(is2)) return { commands: [], procedureName: 'SwIo', error: 'SwIo Error: Is1 or Is2 invalid.' };
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
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3', meta: { calculatesPi: true } });
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6', meta: { calculatesPo: true, calculatesEff: true } });
      }
      return { commands: generatedCommands, procedureName: 'SwIo' };
    } else if (swPoMatch) {
      const ps1Str = swPoMatch[1].trim();
      const ps2Str = swPoMatch[2].trim();
      const nswStr = swPoMatch[3].trim();
      let ps1: number, ps2: number;

      if (ps1Str === '') ps1 = 0; else ps1 = parseFloat(ps1Str);
      if (ps2Str === '') {
        const nomP = parseFloat(nominalPowerDefault || '');
        if (isNaN(nomP)) return { commands: [], procedureName: 'SwPo', error: 'SwPo Error: Cannot calc default Ps2. Nominal Power invalid or not set.' };
        ps2 = nomP;
      } else ps2 = parseFloat(ps2Str);

      const voN = parseFloat(voNominalDefault || '');
      if (isNaN(voN) || voN === 0) return { commands: [], procedureName: 'SwPo', error: 'SwPo Error: Vo (Nominal) is invalid, zero, or not set. Required for Is calculation.' };

      if (isNaN(ps1) || isNaN(ps2)) return { commands: [], procedureName: 'SwPo', error: 'SwPo Error: Ps1 or Ps2 invalid.' };
      
      const is1 = ps1 / voN;
      const is2 = ps2 / voN;

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
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3', meta: { calculatesPi: true } });
        generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6', meta: { calculatesPo: true, calculatesEff: true } });
      }
      return { commands: generatedCommands, procedureName: 'SwPo' };
    } else if (swPoViMatch) {
      const ps1Str = swPoViMatch[1].trim();
      const ps2Str = swPoViMatch[2].trim();
      const nswStr = swPoViMatch[3].trim();
      const vs1Str = swPoViMatch[4].trim();
      const vs2Str = swPoViMatch[5].trim();
      const nswvStr = swPoViMatch[6].trim();

      let ps1: number, ps2: number;
      if (ps1Str === '') ps1 = 0; else ps1 = parseFloat(ps1Str);
      if (ps2Str === '') {
        const nomP = parseFloat(nominalPowerDefault || '');
        if (isNaN(nomP)) return { commands: [], procedureName: 'SwPoVi', error: 'SwPoVi Error: Cannot calc default Ps2. Nominal Power invalid or not set.' };
        ps2 = nomP;
      } else ps2 = parseFloat(ps2Str);

      const voN = parseFloat(voNominalDefault || '');
      if (isNaN(voN) || voN === 0) return { commands: [], procedureName: 'SwPoVi', error: 'SwPoVi Error: Vo (Nominal) is invalid, zero, or not set. Required for Is calculation.' };
      if (isNaN(ps1) || isNaN(ps2)) return { commands: [], procedureName: 'SwPoVi', error: 'SwPoVi Error: Ps1 or Ps2 invalid.' };

      let nsw = nswStr === '' ? 2 : parseInt(nswStr, 10);
      if (isNaN(nsw) || nsw < 2) nsw = 2;
      if (nsw > 20) nsw = 20;

      const is1_po = ps1 / voN;
      const is2_po = ps2 / voN;

      let vs1: number, vs2: number;
      if (vs1Str === '' && viMinDefault && viMinDefault.trim() !== '') vs1 = parseFloat(viMinDefault); else vs1 = parseFloat(vs1Str);
      if (vs2Str === '' && viMaxDefault && viMaxDefault.trim() !== '') vs2 = parseFloat(viMaxDefault); else vs2 = parseFloat(vs2Str);
      if (isNaN(vs1) || isNaN(vs2)) return { commands: [], procedureName: 'SwPoVi', error: 'SwPoVi Error: Vs1 or Vs2 for Vi sweep is invalid or defaults not set.' };

      let nswv = nswvStr === '' ? 2 : parseInt(nswvStr, 10);
      if (isNaN(nswv) || nswv < 2) nswv = 2;
      if (nswv > 20) nswv = 20;

      const generatedCommands: QueuedCommand[] = [];
      for (let v_idx = 0; v_idx < nswv; v_idx++) {
        const t_v = (nswv === 1) ? 0 : v_idx / (nswv - 1);
        const vx = vs1 + t_v * (vs2 - vs1);
        generatedCommands.push({ text: `VOLT ${vx.toFixed(2)}`, targetPort: 'COM3' });

        for (let i = 0; i < nsw; i++) {
          const t_po = (nsw === 1) ? 0 : i / (nsw - 1);
          const ix = is1_po + t_po * (is2_po - is1_po);
          generatedCommands.push({ text: `CURR ${ix.toFixed(2)}`, targetPort: 'COM6' });
          generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM3' });
          generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM6' });
          generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3', meta: { calculatesPi: true } });
          generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6', meta: { calculatesPo: true, calculatesEff: true } });
        }
      }
      return { commands: generatedCommands, procedureName: 'SwPoVi' };

    } else if (poutMatch) {
      const isStr = poutMatch[1].trim();
      const generatedCommands: QueuedCommand[] = [];
      if (isStr !== '') {
        const isValue = parseFloat(isStr);
        if (isNaN(isValue)) return { commands: [], procedureName: 'Pout', error: 'Pout Error: Is parameter must be a valid number if provided.' };
        generatedCommands.push({ text: `CURR ${isValue.toFixed(2)}`, targetPort: 'COM6' });
      }
      generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM6' });
      generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM6', meta: { calculatesPo: true } });
      return { commands: generatedCommands, procedureName: 'Pout' };
    } else if (pinMatch) {
      const vsStr = pinMatch[1].trim();
      const generatedCommands: QueuedCommand[] = [];
      if (vsStr !== '') {
        const vsValue = parseFloat(vsStr);
        if (isNaN(vsValue)) return { commands: [], procedureName: 'Pin', error: 'Pin Error: Vs parameter must be a valid number if provided.' };
        const viMin = parseFloat(viMinDefault || '');
        const viMax = parseFloat(viMaxDefault || '');
        if (isNaN(viMin) || isNaN(viMax)) {
          return { commands: [], procedureName: 'Pin', error: 'Pin Error: Vi(min) or Vi(max) not set or invalid in User Parameters. Required for Vs validation.' };
        }
        if (vsValue < viMin || vsValue > viMax) {
          return { commands: [], procedureName: 'Pin', error: `Pin Error: Vs (${vsValue}) out of range [${viMin}, ${viMax}].` };
        }
        generatedCommands.push({ text: `VOLT ${vsValue.toFixed(2)}`, targetPort: 'COM3' });
      }
      generatedCommands.push({ text: 'MEAS:VOLT?', targetPort: 'COM3' });
      generatedCommands.push({ text: 'MEAS:CURR?', targetPort: 'COM3', meta: { calculatesPi: true } });
      return { commands: generatedCommands, procedureName: 'Pin' };
    } else if (procText) {
      return { 
        commands: [], 
        error: `Unrecognized procedure: "${procText}". Please use a defined procedure (e.g., SwVin, SwIo, SwPo, SwPoVi, Pin, Pout) or the 'Enter Command' section for individual commands.` 
      };
    }
    return { commands: [] };
  };

  return {
    procedureText,
    setProcedureText,
    generateCommandsFromProcedure,
  };
}
