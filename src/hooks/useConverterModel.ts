
'use client';

import { useState, useEffect } from 'react';

// Interface for the parameters that might be loaded for a converter model
export interface ConverterParams {
  nominalPower: string;
  viMin: string;
  viMax: string;
  voNominal: string;
  // You can add other parameters here as needed
}

export interface UseConverterModelReturn {
  converterModel: string;
  setConverterModel: React.Dispatch<React.SetStateAction<string>>;
  availableModels: string[];
  loadConverterParams: (model: string) => Promise<ConverterParams | null>;
  saveConverterParams: (model: string, params: ConverterParams) => Promise<boolean>;
  getAvailableModelNames: () => string[]; // Added for completeness, though availableModels state is preferred
}

// Mock database: In-memory object to store parameters by model name
const mockParameterDatabase: Record<string, ConverterParams> = {
  "XYZ-123": {
    nominalPower: '100',
    viMin: '9',
    viMax: '36',
    voNominal: '12',
  },
  "ABC-789": {
    nominalPower: '200',
    viMin: '12',
    viMax: '48',
    voNominal: '24',
  },
  "TEST-001": {
    nominalPower: '50',
    viMin: '5',
    viMax: '20',
    voNominal: '5',
  },
};


export function useConverterModel(): UseConverterModelReturn {
  const [converterModel, setConverterModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    // Initialize availableModels from the mock database keys
    setAvailableModels(Object.keys(mockParameterDatabase).sort());
  }, []);

  const getAvailableModelNames = (): string[] => {
    return Object.keys(mockParameterDatabase).sort();
  };

  const loadConverterParams = async (model: string): Promise<ConverterParams | null> => {
    console.log(`Attempting to load parameters for model: ${model}`);
    if (mockParameterDatabase[model]) {
      return mockParameterDatabase[model];
    }
    return null; // Model not found
  };

  const saveConverterParams = async (model: string, params: ConverterParams): Promise<boolean> => {
    if (!model.trim()) {
        console.error('Save failed: Converter model name cannot be empty.');
        return false;
    }
    console.log(`Attempting to save parameters for model: ${model}`, params);
    
    const modelExists = !!mockParameterDatabase[model];
    mockParameterDatabase[model] = { ...params };

    if (!modelExists) {
      // If it's a new model, update the availableModels list
      setAvailableModels(prevModels => [...prevModels, model].sort());
    }
    
    console.log('Current mock database:', mockParameterDatabase);
    return true; // Assume save is successful for mock
  };

  return {
    converterModel,
    setConverterModel,
    availableModels,
    loadConverterParams,
    saveConverterParams,
    getAvailableModelNames,
  };
}

