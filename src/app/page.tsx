"use client";
/// <reference lib="dom" />

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plug } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useComPort } from '../hooks/useComPort'; // Import the custom hook

// --- Refactored Send/Read Function ---
// This function remains here as it's used by the main page logic too,
// but it's passed to the hook as a dependency.
async function sendAndRead(
  // @ts-ignore
  port: SerialPort,

  commandToSend: string,
  responseUpdater: React.Dispatch<React.SetStateAction<string>>,
  timeoutMs: number = 2000,
  lineEnding: string = '\n', // Parameter for sending
  responseDelimiter: string = '\n' // Add this parameter for receiving
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
      responseUpdater(prev => prev + `Sending: "${commandToSend}" (No Response Expected)`);
    } else {
      // Update log - Use functional update
      responseUpdater(prev => prev + `Sending: "${commandToSend}"...`);
    }


    // Send the command with Line Feed
    const dataToSend = new TextEncoder().encode(commandToSend + lineEnding); // Use the lineEnding parameter

    console.log('Attempting to write to port:', commandToSend); // Add this line
    await writer.write(dataToSend);
    console.log('Write to port complete.'); // Add this line

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
               // @ts-ignore - TS doesn't like resolve() without value, but needed for Promise.race
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
            // Adjust '\n' if your device uses a different terminator like '\n' // <-- Corrected comment
            if (incomingData.includes(responseDelimiter)) { // Check for the specified response delimiter
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
  // const [isConnected, setIsConnected] = useState(false); // Moved to hook
  // const [port, setPort] = useState<SerialPort | null>(null); // Moved to hook
  const [commands, setCommands] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false); // Shared busy state
  const [commandResponses, setCommandResponses] = useState<string[]>([]); // Store responses

  // --- Use the custom hook ---
  const { port, isConnected, activatePort } = useComPort({
    setIsBusy,
    setResponse,
    setCommandResponses,
    sendAndRead, // Pass the sendAndRead function as a dependency
  });
  // Note: handleActivate function is now activatePort returned from the hook

  const handleAddCommand = () => {
    if (!command.trim()) {

      setResponse(prev => prev + '\nPlease enter a command to send.'); // Functional update


        return;
    }

    setCommands(prevCommands => [...prevCommands, command]); // Add to the queue
    // Initialize 8 empty strings for response + 7 extra text boxes
    setCommandResponses(prevResponses => [...prevResponses, '', '', '', '', '', '', '', '']); // Updated for 8 columns (1 response + 7 extra)
    setCommand(''); // Clear the input field
  };


  const handleSendMultipleCommands = async () => {


    if (!port || !isConnected) {
      setResponse(prev => prev + '\n Port not connected or activated. Please activate first.'); // Functional update

      return;
    }
    if (isBusy) {
      setResponse(prev => prev + '\n Busy with previous operation. Please wait.'); // Functional update

        return;

    }
    setIsBusy(true);

    try {
      // We now have 8 columns to update (1 response + 7 extra)
      const updatedResponses = [...commandResponses]; // Copy current state
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        try {
          // Use the 'port' state variable returned from the hook
          const cmdResponse = await sendAndRead(port, cmd, setResponse);
          // Update the first column (index 8*i) for the actual response
          updatedResponses[8 * i] = cmdResponse; // Store response for this command in the first of 8 slots
        } catch (error) {
           // Update the first column (index 8*i) with "Error" on failure
          updatedResponses[8 * i] = 'Error'; // Store "Error" if there was an error
        }
        setCommandResponses([...updatedResponses]); // Update state after each command
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2000ms
      }


    } catch (error) {
        // Error is already logged by sendAndRead, could add more context here if needed
        console.error("handleSendCommand caught:", error);
    } finally {
        setIsBusy(false); // Clear busy flag
    }
  };


  // handleActivate is removed, use activatePort from the hook


  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0</h1>

      <div className="w-full space-y-4">
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

            {/* Disable button when busy */}
            <Button onClick={handleAddCommand} className="mt-2 w-full" disabled={isBusy}>
              Add Command
            </Button>
          </div>
          {commands.length > 0 && (
              <div className="w-full mt-4"> {/* Increased max-w */} 
              <Table>
                  <TableCaption>List of commands in queue</TableCaption>
                  <TableHeader>
                  <TableRow>
                      <TableHead className="w-[90px]">Resp</TableHead>
                      {/* Replaced Extra 1-7 headers with specific labels */}
                      {["Vi", "Ii", "Pi", "Vo", "Io", "Po", "Eff"].map((label, i) => (
                           <TableHead key={`data-header-${i}`} className="w-[50px]">{label}</TableHead>
                       ))}
                      <TableHead className="w-[90px]">Command</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                  {commands.map((cmd, index) => (
                      <TableRow key={index}>
                          {/* Render 8 cells: 1 for response + 7 for extra */}
                          {Array.from({ length: 8 }).map((_, cellIndex) => (
                              <TableCell key={`cell-${index}-${cellIndex}`}>
                                  {/* The first cell (cellIndex 0) displays the response */}
                                  {cellIndex === 0 ? (
                                       <Input type="text" value={commandResponses[index * 8] || ''} readOnly className="w-[90px]"/>
                                   ) : (
                                       // The other 7 cells are empty text boxes
                                      <Input type="text" value="" readOnly className="w-[50px]"/>
                                   )}

                              </TableCell>
                          ))}
                          {/* Command cell remains */}
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
          {/* Use activatePort from the hook for the button click handler */}
          {/* Button text now reflects connection state correctly */}
          <Button
            onClick={activatePort}
            variant="outline"
            className="w-full"
            disabled={isBusy}
            >
            {isBusy ? (isConnected ? 'Disconnecting...' : 'Connecting...') : (isConnected ? 'Deactivate COM Port' : 'Activate COM Port')}
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
