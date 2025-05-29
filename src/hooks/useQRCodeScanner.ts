\
"use client";
/// <reference lib="dom" />

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
        
        // Placeholder for QR code scanning logic
        // In a real implementation, you would use a library like jsQR or zxing-js here
        // to continuously scan frames from the videoRef.
        console.log("Camera activated. Implement QR Code scanning library here.");
        
        // For demonstration, let's simulate a scan after 5 seconds
        // setTimeout(() => {
        //   if (isScanning) { // Check if still scanning
        //     const fakeQrData = { model: "DemoModel123", date: "2024-07-31" };
        //     setScannedModel(fakeQrData.model);
        //     setScannedDate(fakeQrData.date);
        //     console.log("Simulated QR scan:", fakeQrData);
        //     stopScan(); 
        //   }
        // }, 5000);

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
  }, [stopScan]); // Removed isScanning from dependencies to avoid issues with setTimeout example

  // Cleanup effect
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
// export const parseQRCodeData = (qrString: string): QRCodeData | null => {
//   try {
//     const data = JSON.parse(qrString);
//     if (data && typeof data.model === 'string' && typeof data.date === 'string') {
//       return data;
//     }
//     return null;
//   } catch (e) {
//     console.error("Failed to parse QR code data:", e);
//     return null;
//   }
// };
