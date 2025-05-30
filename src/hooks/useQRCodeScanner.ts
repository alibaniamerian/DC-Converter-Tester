
"use client";
/// <reference lib="dom" />
import jsQR from 'jsqr';
import { useEffect, useState, useCallback, useRef } from 'react';

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

  // Ref to hold the current scanning status for the animation loop
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

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
      // videoRef.current.load(); // Optional: reset video state
    }
    setIsScanning(false);
    console.log("QR Scanning stopped.");
  }, []);

  const startScan = useCallback(async () => {
    console.log("Attempting to start QR scan...");
    // Ensure any previous scan is stopped
    if (isScanningRef.current) {
        stopScan(); // Stop existing scan first
        await new Promise(resolve => setTimeout(resolve, 100)); // Short delay to allow resources to release
    }

    setIsScanning(true);
    setError(null);
    setScannedModel(null);
    setScannedDate(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("getUserMedia is not supported in this browser.");
      console.error("getUserMedia not supported.");
      setIsScanning(false); // Ensure isScanning is false if we bail early
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

        const scanFrame = () => {
          // Use isScanningRef.current for the check
          console.log(`scanFrame: Entered. isScanningRef.current=${isScanningRef.current}`);

          if (!isScanningRef.current || !videoRef.current || !streamRef.current || videoRef.current.paused || videoRef.current.ended) {
            console.log("scanFrame: Exiting - not scanning, video not playing, or videoRef/streamRef is null.");
            return;
          }
          
          if (videoRef.current.readyState < HTMLVideoElement.HAVE_ENOUGH_DATA) {
            console.log(`scanFrame: Video not ready yet (readyState ${videoRef.current.readyState}). Requesting next frame.`);
            if (isScanningRef.current) { // Only continue if still supposed to be scanning
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
          
          console.log("scanFrame: jsQR result - ", code ? `Data: ${code.data.substring(0,30)}...` : "No QR code detected");

          if (code) {
            console.log("jsQR detected QR Code. Raw data:", code.data);
            const parsedData = parseQRCodeData(code.data);
            if (parsedData) {
              console.log("Parsed QR data:", parsedData);
              setScannedModel(parsedData.model);
              setScannedDate(parsedData.date);
              setConverterModel(parsedData.model); // Call the setter from props
              setError(null);
              stopScan(); // Stop scanning on success
              return; 
            } else {
              console.warn("Failed to parse QR code data. Raw data:", code.data);
              setError(`QR detected, but data format is incorrect. Expected JSON with "model" and "date". Got: ${code.data.substring(0, 50)}...`);
              // Optionally, continue scanning or stop on parse error. Let's continue for now.
            }
          }
          
          if (isScanningRef.current && streamRef.current) { 
            animationFrameIdRef.current = requestAnimationFrame(scanFrame);
          }
        };
        
        // Ensure isScanningRef.current is true before starting the loop
        if (isScanningRef.current) {
            animationFrameIdRef.current = requestAnimationFrame(scanFrame);
        } else {
            console.warn("startScan: isScanningRef.current became false before scanFrame loop started. Aborting scan initiation.");
            stopScan(); // Ensure cleanup if we don't start the loop
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
  }, [stopScan, setConverterModel]); // Removed isScanning, added setConverterModel

  useEffect(() => {
    // Cleanup effect when the component unmounts
    return () => {
      console.log("useQRCodeScanner: Unmounting, calling stopScan.");
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
