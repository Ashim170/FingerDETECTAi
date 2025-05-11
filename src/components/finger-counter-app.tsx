"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { detectNumberOfFingers } from '@/ai/flows/detect-number-of-fingers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Camera, AlertTriangle, Hand } from 'lucide-react';

type PermissionStatus = 'idle' | 'pending' | 'granted' | 'denied';

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const DETECTION_INTERVAL = 1500; // milliseconds

interface AnimatedNumberProps {
  value: number | null;
}

const AnimatedNumberDisplay: React.FC<AnimatedNumberProps> = ({ value }) => {
  return (
    <div
      key={value === null ? 'null' : value} // Change key to trigger animation
      className="text-7xl sm:text-8xl md:text-9xl font-bold text-accent-foreground bg-accent p-4 rounded-lg shadow-xl animate-number-pop flex items-center justify-center min-w-[6rem] min-h-[6rem] sm:min-w-[8rem] sm:min-h-[8rem]"
    >
      {value === null ? '-' : value}
    </div>
  );
};


export default function FingerCounterApp() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [detectedFingers, setDetectedFingers] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const requestCameraPermission = async () => {
    setPermissionStatus('pending');
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      });
      setStream(mediaStream);
      setPermissionStatus('granted');
    } catch (err) {
      console.error("Error accessing camera:", err);
      if (err instanceof Error) {
         if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            setError("Camera permission was denied. Please enable it in your browser settings and refresh the page.");
         } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            setError("No camera found. Please ensure a camera is connected and enabled.");
         } else {
            setError(`Failed to access camera: ${err.message}`);
         }
      } else {
         setError("An unknown error occurred while accessing the camera.");
      }
      setPermissionStatus('denied');
    }
  };

  const captureFrameAndDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = VIDEO_WIDTH;
    canvas.height = VIDEO_HEIGHT;
    const context = canvas.getContext('2d');

    if (context) {
      context.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      const photoDataUri = canvas.toDataURL('image/jpeg', 0.8);

      if (!photoDataUri || photoDataUri === "data:,") {
        setError("Failed to capture frame from video.");
        setIsLoading(false);
        return;
      }
      
      try {
        const result = await detectNumberOfFingers({ photoDataUri });
        setDetectedFingers(result.numberOfFingers);
      } catch (err) {
        console.error("Error detecting fingers:", err);
        setError(err instanceof Error ? `AI detection failed: ${err.message}` : "AI detection failed due to an unknown error.");
        setDetectedFingers(null); // Reset on error
      }
    } else {
      setError("Failed to get canvas context.");
    }
    setIsLoading(false);
  }, [isLoading]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error("Error playing video:", err);
        setError("Could not play video stream.");
      });
    }
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  useEffect(() => {
    const scheduleDetection = () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
      if (permissionStatus === 'granted' && stream) {
        detectionTimeoutRef.current = setTimeout(async () => {
          await captureFrameAndDetect();
          scheduleDetection(); // Schedule next detection
        }, DETECTION_INTERVAL);
      }
    };

    scheduleDetection();

    return () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, [permissionStatus, stream, captureFrameAndDetect]);
  
  // Effect to check initial permission state for camera if supported
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.permissions) {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then(status => {
        if (status.state === 'granted') {
          // If already granted, auto-request to start
          requestCameraPermission();
        } else if (status.state === 'denied') {
          setPermissionStatus('denied');
           setError("Camera permission was previously denied. Please enable it in your browser settings.");
        }
        // if 'prompt', user will click the button.
      }).catch(e => console.warn("Permission API not fully supported or error:", e));
    }
  }, []);


  return (
    <Card className="w-full max-w-2xl shadow-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl md:text-4xl font-bold flex items-center justify-center gap-2">
          <Hand className="w-8 h-8 text-primary" /> Finger Counter
        </CardTitle>
        <CardDescription className="text-md">
          Show your hand to the camera and see the magic!
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        {permissionStatus === 'idle' || permissionStatus === 'pending' ? (
          <Button onClick={requestCameraPermission} disabled={permissionStatus === 'pending'} size="lg">
            {permissionStatus === 'pending' ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Camera className="mr-2 h-5 w-5" />
            )}
            {permissionStatus === 'pending' ? 'Requesting...' : 'Enable Camera'}
          </Button>
        ) : null}

        {error && (
          <Alert variant="destructive" className="w-full">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {permissionStatus === 'denied' && !error && (
           <Alert variant="destructive" className="w-full">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>Permission Denied</AlertTitle>
            <AlertDescription>Camera permission is required. Please enable it in your browser settings and refresh.</AlertDescription>
          </Alert>
        )}

        {permissionStatus === 'granted' && (
          <div className="w-full flex flex-col items-center space-y-4">
            <div className="relative w-full max-w-md aspect-[4/3] bg-secondary rounded-lg overflow-hidden shadow-lg">
              <video
                ref={videoRef}
                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror display
                playsInline
                muted // Mute to avoid feedback loops if mic was accidentally requested
                aria-label="Camera feed"
              />
              {isLoading && videoRef.current?.srcObject && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <Loader2 className="h-12 w-12 text-white animate-spin" />
                 </div>
              )}
            </div>
            <AnimatedNumberDisplay value={detectedFingers} />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true"></canvas>
      </CardContent>
    </Card>
  );
}
