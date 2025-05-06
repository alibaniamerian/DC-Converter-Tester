
import { useState } from 'react';

// Define the shape of the props expected by the hook
interface UseComPortProps {
  setIsBusy: (isBusy: boolean) => void;
  setResponse: (updater: (prev: string) => string) => void;
  setCommandResponses: (responses: string[]) => void;
  sendAndRead: (port: SerialPort, command: string, responseUpdater: (updater: (prev: string) => string) => void) => Promise<string>;
}

// Define the shape of the object returned by the hook
interface UseComPortReturn {
  port1: SerialPort | null;
  port2: SerialPort | null;
  isConnected1: boolean;
  isConnected2: boolean;
  activatePort1: (portFilter?: SerialPortFilter) => Promise<void>; // portFilter is now optional
  activatePort2: (portFilter?: SerialPortFilter) => Promise<void>; // portFilter is now optional
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export const useComPort = ({
  setIsBusy,
  setResponse,
  // setCommandResponses, // Not used directly in the hook for now
  // sendAndRead, // Not used directly in the hook for now
}: UseComPortProps): UseComPortReturn => {
  const [port1, setPort1] = useState<SerialPort | null>(null);
  const [port2, setPort2] = useState<SerialPort | null>(null);
  const [isConnected1, setIsConnected1] = useState(false);
  const [isConnected2, setIsConnected2] = useState(false);

  const activatePort = async (portNumber: number, portFilter?: SerialPortFilter) => {
    // setIsBusy(true); // Busy state will be handled by the calling component (page.tsx)
    let currentPortState = portNumber === 1 ? { port: port1, isConnected: isConnected1, setPort: setPort1, setIsConnected: setIsConnected1 } 
                                       : { port: port2, isConnected: isConnected2, setPort: setPort2, setIsConnected: setIsConnected2 };
    const portName = portNumber === 1 ? "COM3" : "COM6"; // For logging

    if (currentPortState.port && currentPortState.isConnected) {
      try {
        await currentPortState.port.close();
        currentPortState.setPort(null);
        currentPortState.setIsConnected(false);
        setResponse(prev => prev + `/n${portName} Port Disconnected`);
      } catch (error: any) {
        setResponse(prev => prev + `/nError disconnecting ${portName}: ${error.message}`);
        // Reset state even on error
        currentPortState.setPort(null);
        currentPortState.setIsConnected(false);
      } finally {
        // setIsBusy(false);
      }
    } else {
      if ('serial' in navigator) {
        try {
          const requestOptions: { filters?: SerialPortFilter[] } = {};
          // Only add filters if portFilter is provided and has properties
          if (portFilter && (portFilter.usbProductId || portFilter.usbVendorId)) {
            requestOptions.filters = [portFilter];
          }
          
          // @ts-ignore
          const newPort = await navigator.serial.requestPort(requestOptions);
          await newPort.open({ baudRate: 9600 });
          currentPortState.setPort(newPort);
          currentPortState.setIsConnected(true);
          setResponse(`${portName} Port Activated`); // Clear previous log for this port actions
        } catch (error: any) {
          // Check if the error is due to user cancellation
          if (error.name === 'NotFoundError' || error.message.includes('No port selected')) {
            setResponse(prev => prev + `/n${portName} connection cancelled by user.`);
          } else {
            setResponse(prev => prev + `/nError connecting to ${portName}: ${error.message}`);
          }
          currentPortState.setPort(null);
          currentPortState.setIsConnected(false);
        } finally {
          // setIsBusy(false);
        }
      } else {
        setResponse(prev => prev + '/nWeb Serial API is not supported in this browser.');
        // setIsBusy(false);
      }
    }
  };

  return {
    port1,
    port2,
    isConnected1,
    isConnected2,
    activatePort1: (portFilter?: SerialPortFilter) => activatePort(1, portFilter),
    activatePort2: (portFilter?: SerialPortFilter) => activatePort(2, portFilter),
  };
};

declare global {
    interface SerialPort extends EventTarget {
        open(options: SerialOptions): Promise<void>;
        close(): Promise<void>;
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
    }

    interface SerialOptions {
        baudRate: number;
    }

    interface Navigator {
        serial: {
            requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
        };
    }
}

export {};
