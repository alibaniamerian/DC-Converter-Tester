"use client";
/// <reference lib="dom" />

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plug } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";

// --- Refactored Send/Read Function ---
async function sendAndRead(
  // @ts-ignore
  port: SerialPort, 
  
  commandToSend: string,
  responseUpdater: React.Dispatch<React.SetStateAction<string>>,
  timeoutMs: number = 2000
): Promise<string> { // Return the actual data or throw error

  const writer = port.writable?.getWriter();
  const reader = port.readable?.getReader();

  if (!writer || !reader) {

    throw new Error('Failed to acquire port writer or reader.');
  }

  const expectResponse = commandToSend.endsWith('?');

  let responseData = ''; // To store the final response

  try {
    if (!expectResponse) {
      // Update log - Use functional update
      responseUpdater(prev => prev + `\nSending: "${commandToSend}" (No Response Expected)`);
    }

    // Update log - Use functional update
    responseUpdater(prev => prev + `\nSending: "${commandToSend}"...`);

    // Send the command with Line Feed
    const dataToSend = new TextEncoder().encode(commandToSend + '\n');
    await writer.write(dataToSend);

    if (!expectResponse) {
      return "";
    }
    
    // --- Improved Read Logic ---
    let incomingData = '';
    let readerDone = false;
    const startTime = Date.now();
    

    while (!readerDone) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeLeft = timeoutMs - (Date.now() - startTime);
        if (timeLeft <= 0) {
            // If we already have *some* data, resolve with it, otherwise timeout error
            if (incomingData.length > 0) {
               readerDone = true; // Exit loop, treat received data as response
               resolve(); // Need a dummy resolve for Promise.race
            } else {
               reject(new Error(`Timeout: No data received for "${commandToSend}" within ${timeoutMs}ms`));
            }
        } else {
            setTimeout(() => reject(new Error(`Read operation timed out after ${timeLeft}ms delay`)), timeLeft);
            
        }
      });

      const readChunkPromise = reader.read();

      try {
          // Wait for data OR timeout
          const { value, done } = await Promise.race([readChunkPromise, timeoutPromise]);

          if (done) {
            readerDone = true; // Port closed or stream ended
            break;
          }

          if (value) {
            const decodedChunk = new TextDecoder().decode(value);
            incomingData += decodedChunk;
            // --- Check for Delimiter (e.g., newline) ---
            // Adjust '\n' if your device uses a different terminator like '\r\n'
            if (incomingData.includes('\n')) {
               readerDone = true; // Found delimiter, assume full response received
               break;
             }
             // Reset start time for timeout if partial data received, prevents premature timeout if response is slow but steady
             // startTime = Date.now(); // Optional: Uncomment if responses can be very slow streams
          }
      } catch(error) {
           // If it's the timeout error we created, handle it
           if (error instanceof Error && error.message.startsWith('Timeout: No data received')) {
               throw error; // Re-throw the specific timeout error
           }
           // If it's the secondary timeout from Promise.race, check if we have data
           if (incomingData.length > 0) {
               readerDone = true; // Timeout after receiving some data, exit loop
               break;
           } else {
                // Different read error or timeout with no data
                throw error; // Re-throw other errors
           }
      }
    }
    // --- End Improved Read Logic ---


    responseData = incomingData.trim(); // Trim whitespace/newlines

    // Update log with received data - Use functional update
    responseUpdater(prev => prev + `\nResponse: ${responseData}`);
    return responseData; // Return the actual data

  } catch (error: any) {
    // Update log with error - Use functional update
    responseUpdater(prev => prev + `\nError during send/read for "${commandToSend}": ${error.message}`);
    throw error; // Re-throw error to be caught by caller if needed
  } finally {
    // Ensure reader lock is always released, even if writer failed earlier
    if (reader && reader.releaseLock) { // Check if reader exists before releasing
        try { await reader.cancel(); } catch (_) { } // Try to cancel pending reads
        reader.releaseLock();
    }
    writer.releaseLock(); // Release writer lock immediately after write
  }
  
} 



export default function Home() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [port, setPort] = useState<SerialPort | null>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false); // Prevent concurrent commands

  // No need for isFirstRender ref anymore

  const handleActivate = async () => {
     setIsBusy(true); // Prevent other actions while connecting/disconnecting
     if (isConnected && port) {
       try {
         await port.close();
         setPort(null); // Clear port state *before* setting disconnected
         setIsConnected(false);
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
       if ('serial' in navigator) {
         // @ts-ignore
         try {
            // @ts-ignore
            const newPort = await navigator.serial.requestPort();
           await newPort.open({ baudRate: 9600 });

            setPort(newPort); // Set port first
           setIsConnected(true); // Then set connected
           setResponse('COM Port Activated'); // Reset response log on new connection

           // Send *IDN? command automatically and wait for it
           await sendAndRead(newPort, '*IDN?', setResponse);
           // No separate sendIdnCommand function needed anymore

         } catch (error: any) {
           setResponse(prev => prev + `\nError connecting: ${error.message}`); // Functional update
           setPort(null);
           setIsConnected(false);
         } finally {
             setIsBusy(false);

         }
       } else {
         setResponse('Web Serial API is not supported in this browser.');
         setIsBusy(false);
       }
     }
   }

  const handleAddCommand = () => {
    if (!command.trim()) {
      
      setResponse(prev => prev + '\nPlease enter a command to send.\n'); // Functional update
      
        return;
    }

    setCommands(prevCommands => [...prevCommands, command]); // Add to the queue
    setCommand(''); // Clear the input field
  };


  const handleSendMultipleCommands = async () => {


    if (!port || !isConnected) {
      setResponse(prev => prev + '\nPort not connected or activated. Please activate first.\n'); // Functional update
      return;
    }
    if (isBusy) {
        setResponse(prev => prev + '\nBusy with previous operation. Please wait.'); // Functional update
        return;

    }
    setIsBusy(true);

    try {
      for (const cmd of commands) {
        
          await sendAndRead(port, cmd, setResponse); // Send each command sequentially
        
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2000ms
      }
      setCommands([])
    } catch (error) {
        // Error is already logged by sendAndRead, could add more context here if needed
        console.error("handleSendCommand caught:", error);
    } finally {
        setIsBusy(false); // Clear busy flag
    }
  };


  // sendIdnCommand function is removed, integrated into handleActivate


  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0</h1>

      <div className="w-full max-w-md space-y-4">
          <div>
            <label htmlFor="command" className="block text-sm font-medium text-foreground">
              Enter Commands (one per line):
            </label>
            <Input
                id="command"
                placeholder="Enter a command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="mt-1"
            />

            {/* Disable button when busy or not connected */}
            <Button onClick={handleAddCommand} className="mt-2 w-full" disabled={isBusy}>
              Add Command
            </Button>
          </div>
          {commands.length > 0 && (
              <div className="w-full max-w-md mt-4">
              <Table>
                  <TableCaption>List of commands in queue</TableCaption>
                  <TableHeader>
                  <TableRow>
                      <TableHead>Command</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                  {commands.map((cmd, index) => (
                      <TableRow key={index}>
                      <TableCell>{cmd}</TableCell>
                      </TableRow>
                  ))}</TableBody>
              </Table>
              </div>
          )}

          <Button onClick={handleSendMultipleCommands} className="mt-2 w-full" disabled={!isConnected || isBusy}>
              {isBusy ? 'Busy...' : 'Send Commands'}
          </Button>

        <div>
          {/* Disable button when busy */}
          <Button
            onClick={handleActivate}
            variant="outline"
            className="w-full"
            disabled={isBusy}
            >
            {isBusy ? (isConnected ? 'Disconnecting...' : 'Connecting...') : (isConnected ? 'Disconnect COM Port' : 'Activate COM Port')}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div>
          <label htmlFor="response" className="block text-sm font-medium text-foreground">
            Response Log:
          </label>
          <Textarea
            id="response"
            placeholder="Response log will be displayed here"
            value={response}
            readOnly
            className="mt-1 h-60 resize-none" // Increased height a bit
          />
        </div>
      </div>
    </div>
  );
}

