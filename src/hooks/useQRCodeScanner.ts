
"use client";
/// <reference lib="dom" />
import jsQR from 'jsqr';
import { useEffect, useState, useCallback, useRef } from 'react';

interface QRCodeData {
  model: string;
  date: string;
}

interface UseQRCodeScannerProps {
  onModelScannedAndLoadParams: (model: string) => Promise<void>; // Changed prop
}

interface UseQRCodeScannerReturn {
  isScanning: boolean;
  scannedModel: string | null; // Kept for potential display, though main update is via prop
  scannedDate: string | null;  // Kept for potential display
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  startScan: () => Promise<void>;
  stopScan: () => void;
}

export const useQRCodeScanner = ({ onModelScannedAndLoadParams }: UseQRCodeScannerProps): UseQRCodeScannerReturn => {
  const [isScanningState, setIsScanningState] = useState(false);
  const [scannedModel, setScannedModel] = useState<string | null>(null);
  const [scannedDate, setScannedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isScanningRef = useRef(isScanningState);

  useEffect(() => {
    isScanningRef.current = isScanningState;
  }, [isScanningState]);

  const stopScan = useCallback(() => {
    console.log("stopScan called. Current animationFrameId:", animationFrameIdRef.current);
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
    setIsScanningState(false); // This will trigger the useEffect to update isScanningRef
    console.log("QR Scanning stopped.");
  }, []);

  const startScan = useCallback(async () => {
    console.log("Attempting to start QR scan...");
    if (isScanningRef.current) { // Use ref for immediate check
      console.log("Scan already in progress, stopping first.");
      stopScan();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsScanningState(true); // This will trigger the useEffect to update isScanningRef
    setError(null);
    setScannedModel(null);
    setScannedDate(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("getUserMedia is not supported in this browser.");
      console.error("getUserMedia not supported.");
      setIsScanningState(false);
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
        console.log("Camera stream started.");

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
          console.error("Failed to get 2D context from canvas");
          setError("Failed to initialize canvas for QR scanning.");
          stopScan();
          return;
        }
        
        const scanFrame = async () => {
          console.log(`scanFrame: Entered. isScanningRef.current=${isScanningRef.current}`);
          if (!isScanningRef.current || !videoRef.current || !streamRef.current || videoRef.current.paused || videoRef.current.ended) {
            console.log("scanFrame: Exiting - not scanning, or videoRef/streamRef is null, or video ended/paused.");
            return; 
          }

          if (videoRef.current.readyState < HTMLVideoElement.HAVE_ENOUGH_DATA) {
            console.log(`scanFrame: Video not ready (readyState ${videoRef.current.readyState}). Requesting next frame.`);
            if (isScanningRef.current) { // Check ref
              animationFrameIdRef.current = requestAnimationFrame(scanFrame);
            }
            return;
          }

          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;

          if (canvas.width === 0 || canvas.height === 0) {
            console.log("scanFrame: Canvas dimensions are zero. Video metadata might not be fully loaded. Requesting next frame.");
            if (isScanningRef.current) { // Check ref
                animationFrameIdRef.current = requestAnimationFrame(scanFrame);
            }
            return;
          }

          context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code) {
            console.log("jsQR detected QR Code. Raw data:", code.data);
            const parsedData = parseQRCodeData(code.data);
            if (parsedData) {
              console.log("Parsed QR data:", parsedData);
              setScannedModel(parsedData.model); // Still useful for local display if needed
              setScannedDate(parsedData.date);   // Still useful for local display if needed
              try {
                await onModelScannedAndLoadParams(parsedData.model); // Call the prop
                setError(null); // Clear any previous error
              } catch (loadError) {
                console.error("Error loading model params after QR scan:", loadError);
                setError("QR scanned, but failed to load model parameters.");
              }
              stopScan();
              return; 
            } else {
              console.warn("Failed to parse QR code data. Raw data:", code.data);
              setError(`QR detected, but data format is incorrect. Expected JSON with "model" and "date", or "MODEL: ... Date: ...". Got: ${code.data.substring(0, 50)}...`);
              stopScan(); 
              return;
            }
          }
          
          if (isScanningRef.current && streamRef.current) { // Check ref
             animationFrameIdRef.current = requestAnimationFrame(scanFrame);
          } else {
            console.log("scanFrame: Not requesting next frame because isScanningRef.current is false or streamRef.current is null.");
          }
        };
        
        if (isScanningRef.current) { // Check ref again
            animationFrameIdRef.current = requestAnimationFrame(scanFrame);
        } else {
             console.warn("startScan: isScanningRef.current was false before scanFrame loop could be started. Scan not initiated.");
             stopScan(); 
        }

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
  }, [stopScan, onModelScannedAndLoadParams]); // Dependency on the new prop

  useEffect(() => {
    return () => {
      console.log("useQRCodeScanner: Unmounting, calling stopScan.");
      stopScan();
    };
  }, [stopScan]);

  return {
    isScanning: isScanningState,
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
    const jsonData = JSON.parse(qrString);
    if (jsonData && typeof jsonData.model === 'string' && typeof jsonData.date === 'string') {
      console.log("Successfully parsed QR string as JSON:", jsonData);
      return { model: jsonData.model, date: jsonData.date };
    }
  } catch (e) {
    console.warn("QR string is not valid JSON, attempting text format parse. Error:", e);
  }

  const modelDateRegex = /MODEL:\s*([^ \n\r]+)\s*Date:\s*(\d{4}-\d{2}-\d{2})/;
  const match = qrString.match(modelDateRegex);

  if (match && match[1] && match[2]) {
    const model = match[1].trim();
    const date = match[2].trim();
    console.log(`Successfully parsed QR string with regex. Model: ${model}, Date: ${date}`);
    return { model, date };
  }

  console.warn("Failed to parse QR string with known formats. Raw string:", qrString);
  return null;
};
