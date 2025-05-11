
"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { detectNumberOfFingers } from '@/ai/flows/detect-number-of-fingers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Camera, AlertTriangle, Hand, Plus, XIcon, Divide, Trash2, Eraser, ScanLine, Volume2, TimerIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';


type PermissionStatus = 'idle' | 'pending' | 'granted' | 'denied';

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const SCAN_COUNTDOWN_SECONDS = 3;

interface AnimatedNumberProps {
  value: number | null;
}

const AnimatedNumberDisplay: React.FC<AnimatedNumberProps> = ({ value }) => {
  return (
    <div
      key={value === null ? 'null' : value}
      className="text-6xl sm:text-7xl md:text-8xl font-bold text-accent-foreground bg-accent p-3 rounded-lg shadow-xl animate-number-pop flex items-center justify-center min-w-[5rem] min-h-[5rem] sm:min-w-[7rem] sm:min-h-[7rem]"
    >
      {value === null ? '-' : value}
    </div>
  );
};

interface HistoryItem {
  id: string;
  value: number;
  timestamp: number;
}

export default function FingerCounterApp() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [detectedFingers, setDetectedFingers] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCountdown, setScanCountdown] = useState<number | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItemIds, setSelectedHistoryItemIds] = useState<string[]>([]);
  const [calculationResult, setCalculationResult] = useState<number | string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

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

  const speakNumber = (number: number) => {
    if (!('speechSynthesis' in window)) {
      toast({
        variant: 'default', // Changed from 'destructive'
        title: 'Voice Announcement Unavailable',
        description: 'Your browser does not support text-to-speech voice announcement.',
      });
      // Not setting main error state for this non-critical feature
      // setError("Speech synthesis not supported by your browser."); 
      setIsSpeaking(false); // Ensure isSpeaking is false if not supported
      return;
    }
    
    window.speechSynthesis.cancel(); // Cancel any previous speech

    const utterance = new SpeechSynthesisUtterance(`Detected ${number} finger${number === 1 ? '' : 's'}`);
    utterance.lang = 'en-US'; 
    utterance.onstart = () => {
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      // setError(`Could not speak the number: ${event.error}`); // Avoid main error for this
      toast({
        variant: 'destructive',
        title: 'Speech Error',
        description: `Could not announce the number: ${event.error}`,
      });
      setIsSpeaking(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  const captureFrameAndDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended || videoRef.current.readyState < videoRef.current.HAVE_METADATA) {
      console.warn("Video stream is not available, not playing, or not ready for capture.");
      setError("Video stream is not available or not ready. Please ensure camera is active.");
      setIsLoading(false); // Ensure loading is reset if we bail early
      return;
    }
     // isLoading and isSpeaking checks moved to handleScanAndAnnounce initiation
    // if (isLoading || isSpeaking) { 
    //     return;
    // }

    setIsLoading(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = VIDEO_WIDTH;
    canvas.height = VIDEO_HEIGHT;
    const context = canvas.getContext('2d');

    if (context) {
      try {
        context.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      } catch (drawError) {
        console.error("Error drawing video to canvas:", drawError);
        setError("Failed to capture frame for AI processing. Video stream might be corrupted or inaccessible.");
        setIsLoading(false);
        return;
      }
      const photoDataUri = canvas.toDataURL('image/jpeg', 0.8);
      
      if (!photoDataUri || photoDataUri === "data:,") {
        setError("Failed to capture frame from video.");
        setIsLoading(false);
        return;
      }

      try {
        const result = await detectNumberOfFingers({ photoDataUri });
        setDetectedFingers(result.numberOfFingers);
        setError(null); 

        if (history.length === 0 || history[history.length - 1].value !== result.numberOfFingers) {
          setHistory(prevHistory => {
            const newHistoryItem: HistoryItem = {
              id: crypto.randomUUID(),
              value: result.numberOfFingers,
              timestamp: Date.now(),
            };
            const updatedHistory = [...prevHistory, newHistoryItem];
            return updatedHistory.slice(-50);
          });
        }
        speakNumber(result.numberOfFingers);

      } catch (err) {
        console.error("Error detecting fingers:", err);
        setError(err instanceof Error ? `AI detection failed: ${err.message}` : "AI detection failed due to an unknown error.");
        toast({
          variant: 'destructive',
          title: 'AI Detection Error',
          description: err instanceof Error ? err.message : "An unknown error occurred during detection.",
        });
      }
    } else {
      setError("Failed to get canvas context.");
    }
    setIsLoading(false);
  }, [history, toast]); // Removed isLoading, isSpeaking from deps as they are handled before call

  // Stream management effect
  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      if (stream) {
        if (videoElement.srcObject !== stream) {
          videoElement.srcObject = stream;
        }
      } else {
        if (videoElement.srcObject) {
          const mediaStream = videoElement.srcObject as MediaStream;
          mediaStream.getTracks().forEach(track => track.stop());
          videoElement.srcObject = null;
        }
      }
    }
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [stream]);
  
  // Permission query and general cleanup effect
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.permissions) {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then(status => {
        if (status.state === 'granted') {
          requestCameraPermission();
        } else if (status.state === 'denied') {
          setPermissionStatus('denied');
           setError("Camera permission was previously denied. Please enable it in your browser settings.");
        }
      }).catch(e => console.warn("Permission API not fully supported or error:", e));
    }

    return () => { // General cleanup on unmount
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);


  const handleScanAndAnnounce = () => {
    if (isLoading || isSpeaking || scanCountdown !== null) {
      return; // Prevent multiple triggers or scan during active states
    }
    setDetectedFingers(null); // Clear previous detection before new scan
    setError(null);

    if (countdownIntervalRef.current) { // Clear any existing interval
      clearInterval(countdownIntervalRef.current);
    }

    setScanCountdown(SCAN_COUNTDOWN_SECONDS);

    countdownIntervalRef.current = setInterval(() => {
      setScanCountdown(prevCountdown => {
        if (prevCountdown === null) { // Should not happen if interval is running correctly
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return null;
        }
        if (prevCountdown <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          captureFrameAndDetect();
          return null; // Reset countdown
        }
        return prevCountdown - 1;
      });
    }, 1000);
  };

  const handleToggleHistoryItemSelection = (id: string) => {
    setSelectedHistoryItemIds(prevSelected =>
      prevSelected.includes(id)
        ? prevSelected.filter(itemId => itemId !== id)
        : [...prevSelected, id]
    );
    setCalculationResult(null);
  };

  const handleClearSelection = () => {
    setSelectedHistoryItemIds([]);
    setCalculationResult(null);
  };

  const handleClearHistory = () => {
    setHistory([]);
    setSelectedHistoryItemIds([]);
    setCalculationResult(null);
  };

  const handleCalculation = (operation: 'add' | 'multiply' | 'divide') => {
    const selectedItems = history.filter(item => selectedHistoryItemIds.includes(item.id));
    if (selectedItems.length < 2 && (operation === 'add' || operation === 'multiply')) {
      toast({ variant: 'destructive', description: "Select at least 2 numbers to " + operation });
      setCalculationResult("Select at least 2 numbers to " + operation);
      return;
    }
    if (operation === 'divide' && selectedItems.length !== 2) {
      toast({ variant: 'destructive', description: "Select exactly 2 numbers to divide." });
      setCalculationResult("Select exactly 2 numbers to divide.");
      return;
    }
    if (selectedItems.length === 0) {
      toast({ variant: 'destructive', description: "No numbers selected." });
      setCalculationResult("No numbers selected.");
      return;
    }

    const values = selectedItems.map(item => item.value);
    let result: number | string;

    switch (operation) {
      case 'add':
        result = values.reduce((sum, val) => sum + val, 0);
        break;
      case 'multiply':
        result = values.reduce((prod, val) => prod * val, 1);
        break;
      case 'divide':
        if (values[1] === 0) {
          toast({ variant: 'destructive', description: "Cannot divide by zero." });
          result = "Cannot divide by zero.";
        } else {
          result = parseFloat((values[0] / values[1]).toFixed(2)); 
        }
        break;
      default:
        result = "Invalid operation.";
    }
    setCalculationResult(result);
  };

  const selectedValues = history.filter(item => selectedHistoryItemIds.includes(item.id)).map(item => item.value);

  let scanButtonText = 'Scan and Announce';
  let scanButtonIcon = <ScanLine className="mr-2 h-5 w-5" />;
  let scanButtonDisabled = false;

  if (scanCountdown !== null) {
    scanButtonText = `Scanning in ${scanCountdown}...`;
    scanButtonIcon = <TimerIcon className="mr-2 h-5 w-5 animate-pulse" />;
    scanButtonDisabled = true;
  } else if (isLoading) {
    scanButtonText = 'Scanning...';
    scanButtonIcon = <Loader2 className="mr-2 h-5 w-5 animate-spin" />;
    scanButtonDisabled = true;
  } else if (isSpeaking) {
    scanButtonText = 'Speaking...';
    scanButtonIcon = <Volume2 className="mr-2 h-5 w-5" />;
    scanButtonDisabled = true;
  }


  return (
    <Card className="w-full max-w-4xl shadow-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl md:text-4xl font-bold flex items-center justify-center gap-2">
          <Hand className="w-8 h-8 text-primary" /> Finger Counter AI
        </CardTitle>
        <CardDescription className="text-md">
          Show your hand, scan, and hear the count!
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
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-full max-w-md aspect-[4/3] bg-secondary rounded-lg overflow-hidden shadow-lg">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover transform scale-x-[-1]"
                  playsInline
                  muted
                  autoPlay
                  aria-label="Camera feed"
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    if (video.paused) {
                      video.play().catch(err => {
                        if (err.name !== 'AbortError') {
                          console.warn('Failed to play video onLoadedMetadata:', err);
                        }
                      });
                    }
                  }}
                  onError={(e) => {
                    console.error("Video element error event:", e, videoRef.current?.error);
                    setError(`Video element error: ${videoRef.current?.error?.message || 'Unknown video error'}. Please ensure your camera is working and permissions are granted.`);
                  }}
                />
                {(isLoading || isSpeaking || scanCountdown !== null) && videoRef.current?.srcObject && (
                   <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                      {scanCountdown !== null && <TimerIcon className="h-12 w-12 text-white animate-pulse" />}
                      {isLoading && scanCountdown === null && <Loader2 className="h-12 w-12 text-white animate-spin" />}
                      {isSpeaking && scanCountdown === null && !isLoading && <Volume2 className="h-12 w-12 text-white" />}
                   </div>
                )}
              </div>
              <AnimatedNumberDisplay value={detectedFingers} />
              <Button
                onClick={handleScanAndAnnounce}
                disabled={scanButtonDisabled || !stream} // Disable if no stream too
                size="lg"
                className="w-full max-w-xs mt-2"
              >
                {scanButtonIcon}
                {scanButtonText}
              </Button>
            </div>

            <div className="flex flex-col space-y-4 w-full">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xl">History</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleClearHistory} disabled={history.length === 0}>
                      <Trash2 className="mr-1 h-4 w-4" /> Clear All
                    </Button>
                  </div>
                  <CardDescription>Detected finger counts. Click to select for calculation.</CardDescription>
                </CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No history yet. Scan your hand to get started!</p>
                  ) : (
                    <ScrollArea className="h-48 w-full pr-3">
                      <div className="space-y-2">
                        {history.slice().reverse().map(item => (
                          <Button
                            key={item.id}
                            variant={selectedHistoryItemIds.includes(item.id) ? 'default' : 'outline'}
                            className="w-full justify-between text-left h-auto py-2 px-3"
                            onClick={() => handleToggleHistoryItemSelection(item.id)}
                          >
                            <span className="font-semibold text-lg">{item.value} finger{item.value === 1 ? '' : 's'}</span>
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(item.timestamp, { addSuffix: true })}</span>
                          </Button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Calculations</CardTitle>
                  {selectedHistoryItemIds.length > 0 && (
                    <CardDescription>
                      Selected: {selectedValues.join(', ')}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => handleCalculation('add')} disabled={selectedHistoryItemIds.length < 2}>
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                    <Button onClick={() => handleCalculation('multiply')} disabled={selectedHistoryItemIds.length < 2}>
                      <XIcon className="h-4 w-4" /> Multiply
                    </Button>
                    <Button onClick={() => handleCalculation('divide')} disabled={selectedHistoryItemIds.length !== 2}>
                      <Divide className="h-4 w-4" /> Divide
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleClearSelection} disabled={selectedHistoryItemIds.length === 0}>
                     <Eraser className="mr-1 h-4 w-4" /> Clear Selection
                  </Button>
                  {calculationResult !== null && (
                    <Alert className={typeof calculationResult === 'string' && (calculationResult.toLowerCase().includes('cannot') || calculationResult.toLowerCase().includes('select') || calculationResult.toLowerCase().includes('invalid')) ? 'border-destructive text-destructive' : 'border-primary'}>
                      <AlertTitle className={typeof calculationResult === 'string' && (calculationResult.toLowerCase().includes('cannot') || calculationResult.toLowerCase().includes('select')|| calculationResult.toLowerCase().includes('invalid')) ? '' : 'text-primary'}>Result</AlertTitle>
                      <AlertDescription className="font-bold text-lg">
                        {calculationResult}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true"></canvas>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground justify-center flex flex-col items-center space-y-1 pt-4">
        <p>AI-powered finger counting. Click "Scan and Announce" to detect and hear the result.</p>
        <p>&copy; 2025 Aashim Neupane. All rights reserved.</p>
      </CardFooter>
    </Card>
  );
}

