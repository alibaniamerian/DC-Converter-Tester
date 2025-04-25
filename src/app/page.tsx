"use client";
import React, { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plug } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";

export default function Home() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [port, setPort] = useState<SerialPort | null>(null);

  const handleActivate = async () => {
    if (isConnected && port) {
      try {
        await port.close();
        setIsConnected(false);
        setResponse('COM3 Port Disconnected');
      } catch (error: any) {
        setResponse(`Error disconnecting: ${error.message}`);
      }
      setPort(null);
    } else {
      // Request serial port access
      if ('serial' in navigator) {
        try {
          const newPort = await navigator.serial.requestPort();
          
          //open the port
          await newPort.open({ baudRate: 9600 });

          setPort(newPort);
          setIsConnected(true);
          setResponse('COM3 Port Activated');
        } catch (error: any) {
          setResponse(`Error: ${error.message}`);
        }
      } else {
        setResponse('Web Serial API is not supported in this browser.');
      }
    }
  };

  const handleSendCommand = async () => {
    if (!port) {
      setResponse('Port not activated. Please activate COM3 first.');
      return;
    }

    const writer = port.writable?.getWriter();
    const reader = port.readable?.getReader();

    if (!writer) {
        setResponse('Failed to acquire port writer.');
        return;
    }
    if (!reader) {
      setResponse('Failed to acquire port reader.');
      return;
    }

    try {
      // Send the command with Line Feed
      const data = new TextEncoder().encode(command);
      await writer.write(data);
      setResponse(`Command "${command}" sent with Line Feed. Response pending...`);

      // Listen for incoming data
      let incomingData = '';
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout: No data received within 2000ms'));
        }, 2000);
      });

      const readPromise = new Promise(async (resolve, reject) => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              resolve(incomingData);
              break;
            }
            incomingData += new TextDecoder().decode(value);
            resolve(incomingData);
          }
        } catch (readError: any) {
          reject(readError);
        }
      });

      // Race the timeout and the read operation
      Promise.race([readPromise, timeoutPromise])
        .then((data: any) => {
          setResponse(`Response: ${data}`);
        })
        .catch((error: any) => {
          setResponse(`Error receiving data: ${error.message}`);
        });

    } catch (error: any) {
      setResponse(`Error sending command: ${error.message}`);
    } finally {
      writer.releaseLock();
      reader.releaseLock();
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">DC Converter Tester V0</h1>

      <div className="w-full max-w-md space-y-4">
        <div>
          <label htmlFor="command" className="block text-sm font-medium text-foreground">
            Enter Command:
          </label>
          <Input
            id="command"
            type="text"
            placeholder="Enter command to send"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="mt-1"
          />
          <Button onClick={handleSendCommand} className="mt-2 w-full">Send Command</Button>
        </div>

        <div>
          <Button
            onClick={handleActivate}
            variant="outline"
            className="w-full"
            >
            {isConnected ? 'Disconnect COM3' : 'Activate COM3'}
            <Plug className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div>
          <label htmlFor="response" className="block text-sm font-medium text-foreground">
            Response:
          </label>
          <Textarea
            id="response"
            placeholder="Response from COM3 will be displayed here"
            value={response}
            readOnly
            className="mt-1 h-40 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
