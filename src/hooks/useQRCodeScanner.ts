
"use client";
/// <reference lib="dom" />
import jsQR from 'jsqr';
import { useEffect, useState, useCallback, useRef } from 'react';

interface QRCodeData {
  model: string;
  date: string;
  serialNumber?: string; // Added optional serialNumber
}

interface UseQRCodeScannerProps {
  onModelScannedAndLoadParams: (model: string, serialNumber?: string, scannedDate?: string) => Promise<void>;
}

interface UseQRCodeScannerReturn {
  isScanning: boolean;
  scannedModel: string | null;
  scannedDate: string | null;
  scannedSerialNumber: string | null;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  startScan: () => Promise<void>;
  stopScan: () => void;
}

export const useQRCodeScanner = ({ onModelScannedAndLoadParams }: UseQRCodeScannerProps): UseQRCodeScannerReturn => {
  const [isScanningState, setIsScanningState] = useState(false);
  const [scannedModel, setScannedModel] = useState<string | null>(null);
  const [scannedDate, setScannedDate] = useState<string | null>(null);
  const [scannedSerialNumber, setScannedSerialNumber] = useState<string | null>(null);
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
    setIsScanningState(false);
    console.log("QR Scanning stopped.");
  }, []);

  const startScan = useCallback(async () => {
    console.log("Attempting to start QR scan...");
    if (isScanningRef.current) {
      console.log("Scan already in progress, stopping first.");
      stopScan();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsScanningState(true);
    setError(null);
    setScannedModel(null);
    setScannedDate(null);
    setScannedSerialNumber(null);

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
            if (isScanningRef.current) {
              animationFrameIdRef.current = requestAnimationFrame(scanFrame);
            }
            return;
          }
          
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;

          if (canvas.width === 0 || canvas.height === 0) {
            console.log("scanFrame: Canvas dimensions are zero. Video metadata might not be fully loaded. Requesting next frame.");
            if (isScanningRef.current) {
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
              setScannedModel(parsedData.model);
              setScannedDate(parsedData.date);
              setScannedSerialNumber(parsedData.serialNumber || null);
              try {
                await onModelScannedAndLoadParams(parsedData.model, parsedData.serialNumber, parsedData.date);
                setError(null);
              } catch (loadError) {
                console.error("Error loading model params after QR scan:", loadError);
                setError("QR scanned, but failed to load model parameters.");
              }
              stopScan();
              return;
            } else {
              console.warn("Failed to parse QR code data. Raw data:", code.data);
              setError(`QR detected, but data format is incorrect. Expected JSON or text containing MODEL, DATE/Date, and optionally SN. Got: ${code.data.substring(0, 50)}...`);
              stopScan(); // Stop scanning after a parse failure to prevent continuous errors
              return;
            }
          }

          if (isScanningRef.current && streamRef.current) {
             animationFrameIdRef.current = requestAnimationFrame(scanFrame);
          } else {
            console.log("scanFrame: Not requesting next frame because isScanningRef.current is false or streamRef.current is null.");
          }
        };
        
        if (isScanningRef.current) {
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
  }, [stopScan, onModelScannedAndLoadParams]); // Removed isScanningRef from here, as it's a ref

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
    scannedSerialNumber,
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
      const data: QRCodeData = { model: jsonData.model, date: jsonData.date };
      if (typeof jsonData.serialNumber === 'string') {
        data.serialNumber = jsonData.serialNumber;
      }
      console.log("Successfully parsed QR string as JSON:", data);
      return data;
    }
  } catch (e) {
    // Not JSON, proceed to text parsing
    console.warn("QR string is not valid JSON, attempting text format parse.");
  }

  // Attempt to parse text format by extracting key-value pairs (order-independent)
  const modelMatch = qrString.match(/MODEL:\s*(\S+)/i);
  const dateMatch = qrString.match(/(?:DATE|Date):\s*(\d{4}-\d{2}-\d{2})/i); // Match DATE: or Date:
  const snMatch = qrString.match(/SN:\s*(\S+)/i);

  const model = modelMatch ? modelMatch[1].trim() : null;
  const date = dateMatch ? dateMatch[1].trim() : null;
  const serialNumber = snMatch ? snMatch[1].trim() : undefined;

  if (model && date) {
    const data: QRCodeData = { model, date };
    if (serialNumber) {
      data.serialNumber = serialNumber;
    }
    console.log(`Successfully parsed QR string using key-value extraction. Model: ${model}, Date: ${date}${serialNumber ? `, SN: ${serialNumber}` : ''}`);
    return data;
  }

  console.warn("Failed to parse QR string with known text formats (JSON or Key-Value). Raw string:", qrString);
  return null;
};
