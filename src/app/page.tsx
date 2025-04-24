
"use client";
import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plug } from 'lucide-react';
import { Textarea } from "@/components/ui/textarea";

export default function Home() {
  const [command, setCommand] = useState('');
  const [response, setResponse] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const handleActivate = async () => {
    // Placeholder for serial port activation logic
    setIsConnected(!isConnected);
    setResponse(isConnected ? '' : 'COM3 Port Activated');
  };

  const handleSendCommand = () => {
    // Placeholder for sending command via serial port
    setResponse(`Command "${command}" sent. Response pending...`);
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

    