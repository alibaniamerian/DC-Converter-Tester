
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
  port: SerialPort | null;
  isConnected: boolean;
  activatePort: () => Promise<void>; // Renamed from handleActivate
}

export const useComPort = ({
  setIsBusy,
  setResponse,
  setCommandResponses,
  sendAndRead,
}: UseComPortProps): UseComPortReturn => {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const activatePort = async () => {
    setIsBusy(true); // Prevent other actions while connecting/disconnecting
    if (isConnected && port) {
      // Disconnect logic
      try {
        await port.close();
        setPort(null); // Clear port state *before* setting disconnected
        setIsConnected(false);
        // Corrected: Use \n and keep string on one line
        setResponse(prev => prev + '\nCOM Port Disconnected'); // Use functional update
      } catch (error: any) {
        setResponse(prev => prev + `\nError disconnecting: ${error.message}`); // Functional update

        // Might still be connected or in weird state, try resetting UI
        setPort(null);
        setIsConnected(false);
      } finally {
         setIsBusy(false);
      }
    } else {
      // Connect logic
      if ('serial' in navigator) {
        // @ts-ignore - navigator.serial is not fully typed in standard libs yet
        try {
           // @ts-ignore
           const newPort = await navigator.serial.requestPort();
          await newPort.open({ baudRate: 9600 });
          setPort(newPort); // Set port first
          setIsConnected(true); // Then set connected
          setResponse('COM Port Activated'); // Reset response log on new connection

          

        } catch (error: any) {
          setResponse(prev => prev + `\nError connecting: ${error.message}`); // Functional update

          setPort(null);
          setIsConnected(false);
        } finally {
            setIsBusy(false);
        }
      } else {
        // Corrected: Use \n and keep string on one line
        setResponse(prev => prev + '\nWeb Serial API is not supported in this browser.');
        setIsBusy(false);
      }
    }
  };

  return { port, isConnected, activatePort };
};

// Helper type for SerialPort if not globally available
declare global {
    interface SerialPort extends EventTarget {
        // Define methods and properties you use, e.g.:
        open(options: SerialOptions): Promise<void>;
        close(): Promise<void>;
        // Add readable, writable streams if needed
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
    }

    interface SerialOptions {
        baudRate: number;
        // Add other options like dataBits, stopBits, parity, etc. if needed
    }

    // Extend Navigator interface
    interface Navigator {
        serial: {
            requestPort(options?: any): Promise<SerialPort>;
            // Add getPorts() if needed
        };
    }
}

// Export {} is needed if the file doesn't import/export anything else initially
// to make it a module in TypeScript. It's not strictly necessary here
// because we are exporting useComPort, but good practice.
export {};

