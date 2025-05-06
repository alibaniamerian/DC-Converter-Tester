
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
  activatePort1: (portFilter?: SerialPortFilter) => Promise<void>;
  activatePort2: (portFilter?: SerialPortFilter) => Promise<void>;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export const useComPort = ({
  // setIsBusy, // Prop `setIsBusy` is not used in the hook as page.tsx handles individual port busy states.
  setResponse,
}: UseComPortProps): UseComPortReturn => {
  const [port1, setPort1] = useState<SerialPort | null>(null);
  const [port2, setPort2] = useState<SerialPort | null>(null);
  const [isConnected1, setIsConnected1] = useState(false);
  const [isConnected2, setIsConnected2] = useState(false);

  const activatePort = async (portNumber: number, portFilter?: SerialPortFilter) => {
    let currentPortState = portNumber === 1 
      ? { port: port1, isConnected: isConnected1, setPort: setPort1, setIsConnected: setIsConnected1 }
      : { port: port2, isConnected: isConnected2, setPort: setPort2, setIsConnected: setIsConnected2 };
    const portName = portNumber === 1 ? "COM3" : "COM6";

    if (currentPortState.port && currentPortState.isConnected) {
      try {
        await currentPortState.port.close();
        currentPortState.setPort(null);
        currentPortState.setIsConnected(false);
        setResponse(prev => prev + `${String.fromCharCode(10)}${portName} Port Disconnected`);
      } catch (error: any) {
        setResponse(prev => prev + `${String.fromCharCode(10)}Error disconnecting ${portName}: ${error.message}`);
        currentPortState.setPort(null);
        currentPortState.setIsConnected(false);
      }
    } else {
      if ('serial' in navigator) {
        try {
          const requestOptions: { filters?: SerialPortFilter[] } = {};
          if (portFilter && (portFilter.usbProductId || portFilter.usbVendorId)) {
            requestOptions.filters = [portFilter];
          }
          // @ts-ignore
          const newPort = await navigator.serial.requestPort(requestOptions);
          await newPort.open({ baudRate: 9600 });
          currentPortState.setPort(newPort);
          currentPortState.setIsConnected(true);
          setResponse(prev => `${portName} Port Activated`); // Initial activation message doesn't need preceding newline
        } catch (error: any) {
          if (error.name === 'NotFoundError' || error.message.includes('No port selected')) {
            setResponse(prev => prev + `${String.fromCharCode(10)}${portName} connection cancelled by user.`);
          } else {
            setResponse(prev => prev + `${String.fromCharCode(10)}Error connecting to ${portName}: ${error.message}`);
          }
          currentPortState.setPort(null);
          currentPortState.setIsConnected(false);
        }
      } else {
        setResponse(prev => prev + `${String.fromCharCode(10)}Web Serial API is not supported in this browser.`);
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
