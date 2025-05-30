
"use client";

import { useState, useCallback } from 'react';
import { useConverterModel, type ConverterParams } from './useConverterModel'; // Assuming this path is correct

interface UseDeviceParametersAndModelProps {
  setPageResponse: React.Dispatch<React.SetStateAction<string>>; // For logging
  setPageIsBusy: React.Dispatch<React.SetStateAction<boolean>>;   // For global busy state
}

export interface UseDeviceParametersAndModelReturn {
  nominalPower: string;
  setNominalPower: React.Dispatch<React.SetStateAction<string>>;
  viMin: string;
  setViMin: React.Dispatch<React.SetStateAction<string>>;
  viMax: string;
  setViMax: React.Dispatch<React.SetStateAction<string>>;
  voNominal: string;
  setVoNominal: React.Dispatch<React.SetStateAction<string>>;
  userTimeout: string;
  setUserTimeout: React.Dispatch<React.SetStateAction<string>>;
  converterModel: string;
  setConverterModel: React.Dispatch<React.SetStateAction<string>>;
  availableModels: string[];
  selectAndLoadModelParams: (modelName: string, serialNumberFromScan?: string, scannedDateFromScan?: string) => Promise<void>;
  saveCurrentDeviceParams: () => Promise<void>;
  serialNumber: string;
  setSerialNumber: React.Dispatch<React.SetStateAction<string>>;
  scannedDate: string;
  setScannedDate: React.Dispatch<React.SetStateAction<string>>;
  deviceParams: { 
    nominalPower: string; 
    viMin: string; 
    viMax: string; 
    voNominal: string; 
    serialNumber: string;
    scannedDate: string;
  };
}

export const useDeviceParametersAndModel = ({
  setPageResponse,
  setPageIsBusy,
}: UseDeviceParametersAndModelProps): UseDeviceParametersAndModelReturn => {
  const [nominalPower, setNominalPower] = useState('');
  const [viMin, setViMin] = useState('');
  const [viMax, setViMax] = useState('');
  const [voNominal, setVoNominal] = useState('');
  const [userTimeout, setUserTimeout] = useState<string>('1000');
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [scannedDate, setScannedDate] = useState<string>('');

  const {
    converterModel,
    setConverterModel,
    availableModels,
    loadConverterParams,
    saveConverterParams,
  } = useConverterModel();

  const selectAndLoadModelParams = useCallback(async (modelName: string, serialNumberFromScan?: string, scannedDateFromScan?: string) => {
    if (!modelName) return;
    setConverterModel(modelName); 
    
    if (serialNumberFromScan !== undefined) {
      setSerialNumber(serialNumberFromScan);
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Serial Number from QR: ${serialNumberFromScan}`);
    }
    if (scannedDateFromScan !== undefined) {
      setScannedDate(scannedDateFromScan);
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Scanned Date from QR: ${scannedDateFromScan}`);
    }

    setPageIsBusy(true);
    setPageResponse(prev => prev + `${String.fromCharCode(10)}Loading parameters for model: ${modelName}...`);
    const params = await loadConverterParams(modelName);
    if (params) {
      setNominalPower(params.nominalPower);
      setViMin(params.viMin);
      setViMax(params.viMax);
      setVoNominal(params.voNominal);
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Parameters loaded for ${modelName}.`);
    } else {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Failed to load parameters for ${modelName}. Model not found or no parameters defined. You may need to save new parameters for this model.`);
    }
    setPageIsBusy(false);
  }, [setConverterModel, loadConverterParams, setPageIsBusy, setPageResponse, setSerialNumber, setScannedDate]);

  const saveCurrentDeviceParams = useCallback(async () => {
    if (!converterModel.trim()) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Please enter or select a Converter Model name to save parameters.`);
      return;
    }
    setPageIsBusy(true);
    const currentParams: ConverterParams = {
      nominalPower,
      viMin,
      viMax,
      voNominal,
    };
    setPageResponse(prev => prev + `${String.fromCharCode(10)}Saving parameters for model: ${converterModel}...`);
    const success = await saveConverterParams(converterModel, currentParams);
    if (success) {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Parameters saved for ${converterModel}.`);
    } else {
      setPageResponse(prev => prev + `${String.fromCharCode(10)}Failed to save parameters for ${converterModel}. An error occurred or model name is invalid.`);
    }
    setPageIsBusy(false);
  }, [converterModel, nominalPower, viMin, viMax, voNominal, saveConverterParams, setPageIsBusy, setPageResponse]);
  
  const deviceParams = {
    nominalPower,
    viMin,
    viMax,
    voNominal,
    serialNumber,
    scannedDate,
  };

  return {
    nominalPower,
    setNominalPower,
    viMin,
    setViMin,
    viMax,
    setViMax,
    voNominal,
    setVoNominal,
    userTimeout,
    setUserTimeout,
    converterModel,
    setConverterModel,
    availableModels,
    selectAndLoadModelParams,
    saveCurrentDeviceParams,
    serialNumber,
    setSerialNumber,
    scannedDate,
    setScannedDate,
    deviceParams,
  };
};
