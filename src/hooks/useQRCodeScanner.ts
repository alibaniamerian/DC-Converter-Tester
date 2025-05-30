
"use client";
/// <reference lib="dom" />
import jsQR from 'jsqr';
import { useEffect } from 'react';
import { useState, useCallback, useRef } from 'react';

interface QRCodeData {
  model: string;
  date: string;
}

interface UseQRCodeScannerProps {
  setConverterModel: (model: string) => void;
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

export const useQRCodeScanner = ({ setConverterModel }: UseQRCodeScannerProps): UseQRCodeScannerReturn => {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedModel, setScannedModel] = useState<string | null>(null);
  const [scannedDate, setScannedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const stopScan = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    console.log("QR Scanning stopped.");
  }, []);

  const startScan = useCallback(async () => {
    console.log("Attempting to start QR scan...");
    setIsScanning(true);
    setError(null);
    setScannedModel(null);
    setScannedDate(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("getUserMedia is not supported in this browser.");
      setIsScanning(false);
      console.error("getUserMedia not supported.");
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
        console.log("Camera stream started.");

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          console.error("Failed to get 2D context from canvas");
          setError("Failed to initialize canvas for QR scanning.");
          stopScan();
          return;
        }

        const scanFrame = () => {
          console.log(`scanFrame: Entered. isScanning=${isScanning}`); // LOG ENTRY AND isScanning STATE

          if (!isScanning || !videoRef.current || !streamRef.current) {
            console.log("scanFrame: Exiting - not scanning, or videoRef/streamRef is null.");
            // No recursive call if !isScanning
            return;
          }
          
          console.log(`scanFrame: videoRef.readyState=${videoRef.current.readyState}, HAVE_ENOUGH_DATA=${HTMLVideoElement.HAVE_ENOUGH_DATA}`); // LOG video readyState

          if (videoRef.current.readyState < HTMLVideoElement.HAVE_ENOUGH_DATA) {
            console.log("scanFrame: Video not ready yet (readyState < HAVE_ENOUGH_DATA). Requesting next frame.");
            animationFrameIdRef.current = requestAnimationFrame(scanFrame);
            return;
          }

          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;

          console.log(`scanFrame: Canvas dimensions set - width=${canvas.width}, height=${canvas.height}`);

          if (canvas.width === 0 || canvas.height === 0) {
            console.log("scanFrame: Canvas dimensions are zero. Video metadata might not be fully loaded. Requesting next frame.");
            animationFrameIdRef.current = requestAnimationFrame(scanFrame);
            return;
          }
          
          console.log("scanFrame: Attempting to draw image to canvas.");
          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          console.log("scanFrame: Image drawn to canvas for jsQR.");

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          console.log("scanFrame: getImageData successful. Calling jsQR.");
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          console.log("scanFrame: jsQR result - ", code ? `Data: ${code.data.substring(0,30)}...` : "No QR code detected");

          if (code) {
            console.log("jsQR detected QR Code. Raw data:", code.data);
            const parsedData = parseQRCodeData(code.data);
            if (parsedData) {
              console.log("Parsed QR data:", parsedData);
              setScannedModel(parsedData.model);
              setScannedDate(parsedData.date);
              setConverterModel(parsedData.model);
              setError(null);
              stopScan(); // Stop scanning on success
              return; // Exit scanFrame
            } else {
              console.warn("Failed to parse QR code data. Raw data:", code.data);
              setError(`QR detected, but data format is incorrect. Expected JSON with "model" and "date". Got: ${code.data.substring(0, 50)}...`);
              // Optionally, continue scanning or stop on parse error
            }
          }
          
          // Only request next frame if still scanning and no code was successfully processed and stopped
          if (isScanning && streamRef.current) { 
            animationFrameIdRef.current = requestAnimationFrame(scanFrame);
          }
        };
        
        animationFrameIdRef.current = requestAnimationFrame(scanFrame); // Initial call to start the loop

      } else {
        setError("Video element is not available.");
        console.error("Video element ref is null during startScan.");
        stopScan();
      }
    } catch (err) {
      console.error("Error accessing camera or starting scan:", err);
      if (err instanceof Error) {
        setError(`Camera Error: ${err.name} - ${err.message}`);
      } else {
        setError("An unknown error occurred while accessing the camera.");
      }
      stopScan();
    }
  }, [stopScan, setConverterModel, isScanning]); // Added isScanning to dependencies

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

export const parseQRCodeData = (qrString: string): QRCodeData | null => {
  try {
    const data = JSON.parse(qrString);
    if (data && typeof data.model === 'string' && typeof data.date === 'string') {
      return data;
    }
    console.warn("Parsed JSON, but 'model' or 'date' fields are missing or not strings.", data);
    return null;
  } catch (e) {
    console.warn("Error parsing QR string as JSON:", e);
    return null; 
  }
};

