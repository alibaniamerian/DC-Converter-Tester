
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
  getAvailableModelNames: () => string[];
}

const LOCAL_STORAGE_KEY = 'converterModelsDB';

// Initial default data if nothing is in localStorage
const initialMockDatabase: Record<string, ConverterParams> = {
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

// This will now be initialized from localStorage or with defaults
let mockParameterDatabase: Record<string, ConverterParams> = {};


export function useConverterModel(): UseConverterModelReturn {
  const [converterModel, setConverterModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Load from localStorage on initial mount
    if (typeof window !== 'undefined') {
      try {
        const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedData) {
          mockParameterDatabase = JSON.parse(storedData);
        } else {
          // If nothing in localStorage, use initial defaults and save them
          mockParameterDatabase = { ...initialMockDatabase };
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mockParameterDatabase));
        }
      } catch (error) {
        console.error("Failed to load or parse data from localStorage:", error);
        // Fallback to initial defaults if localStorage is corrupted or inaccessible
        mockParameterDatabase = { ...initialMockDatabase };
      }
      setAvailableModels(Object.keys(mockParameterDatabase).sort());
      setIsInitialized(true);
    }
  }, []);

  const getAvailableModelNames = (): string[] => {
    if (!isInitialized) return []; // Wait for initialization
    return Object.keys(mockParameterDatabase).sort();
  };

  const loadConverterParams = async (model: string): Promise<ConverterParams | null> => {
    if (!isInitialized) {
        await new Promise(resolve => {
            const interval = setInterval(() => {
                if(isInitialized) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
    }
    console.log(`Attempting to load parameters for model: ${model}`);
    if (mockParameterDatabase[model]) {
      return mockParameterDatabase[model];
    }
    return null; // Model not found
  };

  const saveConverterParams = async (model: string, params: ConverterParams): Promise<boolean> => {
    if (!isInitialized) {
        console.error('Save failed: Hook not yet initialized with localStorage data.');
        return false;
    }
    if (!model.trim()) {
        console.error('Save failed: Converter model name cannot be empty.');
        return false;
    }
    console.log(`Attempting to save parameters for model: ${model}`, params);
    
    const modelExists = !!mockParameterDatabase[model];
    mockParameterDatabase[model] = { ...params };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mockParameterDatabase));
      } catch (error) {
        console.error("Failed to save data to localStorage:", error);
        // Optionally, revert the in-memory change or handle the error
        // For now, we'll proceed with the in-memory change even if localStorage fails
      }
    }

    if (!modelExists) {
      setAvailableModels(prevModels => [...prevModels, model].sort());
    }
    
    console.log('Current mock database:', mockParameterDatabase);
    return true; 
  };

  // Update availableModels if mockParameterDatabase changes from an external source (e.g. another tab)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LOCAL_STORAGE_KEY && event.newValue) {
        try {
          mockParameterDatabase = JSON.parse(event.newValue);
          setAvailableModels(Object.keys(mockParameterDatabase).sort());
        } catch (error) {
          console.error("Error processing storage event:", error);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, []);


  return {
    converterModel,
    setConverterModel,
    availableModels: isInitialized ? Object.keys(mockParameterDatabase).sort() : [],
    loadConverterParams,
    saveConverterParams,
    getAvailableModelNames,
  };
}
