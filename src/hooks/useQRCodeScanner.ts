
"use client";
/// <reference lib="dom" />
import jsQR from 'jsqr';
import { useEffect } from 'react';
import { useState, useCallback, useRef } from 'react';

interface QRCodeData {
  model: string;
  date: string;
}

interface UseQRCodeScannerReturn {
  isScanning: boolean;
  scannedModel: string | null;
  scannedDate: string | null;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  startScan: () => Promise<void>;
  stopScan: () => void;
}

export const useQRCodeScanner = (): UseQRCodeScannerReturn => {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedModel, setScannedModel] = useState<string | null>(null);
  const [scannedDate, setScannedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopScan = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    setScannedModel(null);
    setScannedDate(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("getUserMedia is not supported in this browser.");
      setIsScanning(false);
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        const scanFrame = () => {
          if (!isScanning || !videoRef.current || !context || !streamRef.current) {
            // If scanning stopped or resources unavailable, exit
            return;
          }

          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code) {
            console.log("QR Code found:", code.data);
            const parsedData = parseQRCodeData(code.data);
            if (parsedData) {
              setScannedModel(parsedData.model);
              setScannedDate(parsedData.date);
              console.log("Parsed QR data:", parsedData);
              stopScan(); 
              return; // Exit scanFrame as we found and processed the code
            } else {
              console.error("Failed to parse QR code data. Raw data:", code.data);
              setError(`Could not parse QR code data: ${code.data}`);
              // Optionally stop scan on parse error, or let it continue
              // stopScan(); 
              // return;
            }
          }
          
          // Continue scanning only if still active and stream exists
          if (isScanning && streamRef.current) {
            requestAnimationFrame(scanFrame);
          }
        }; // Semicolon added for clarity and to help parser
        
        scanFrame(); // Initial call to start the scanning loop

      } else {
        setError("Video element is not available.");
        stopScan();
      }
    } catch (err) {
      console.error("Error accessing camera or scanning QR:", err);
      if (err instanceof Error) {
        setError(`Error accessing camera: ${err.name} - ${err.message}`);
      } else {
        setError("An unknown error occurred while accessing the camera.");
      }
      stopScan();
    }
  }, [stopScan]); 

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return {
    isScanning,
    scannedModel,
    scannedDate,
    error,
    videoRef,
    startScan,
    stopScan,
  };
};

// Helper to parse QR code string (assuming JSON format)
export const parseQRCodeData = (qrString: string): QRCodeData | null => {
  try {
    const data = JSON.parse(qrString);
    if (data && typeof data.model === 'string' && typeof data.date === 'string') {
      return data;
    }
    return null;
  } catch (e) {
    return null; // Return null on parsing error
  }
};

