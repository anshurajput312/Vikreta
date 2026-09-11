import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Flashlight, 
  FlashlightOff, 
  Volume2, 
  VolumeX, 
  Repeat, 
  Check, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

interface LastScannedItem {
  code: string;
  name: string;
  price?: number;
  time: number;
}

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => Promise<{ success: boolean; productName?: string; price?: number }>;
}

// Audio synthesizer for POS scanner sound effects
const playAudioFeedback = (type: 'success' | 'error') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(240, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // Audio autoplay or permissions restriction
  }
};

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<any>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastScanned, setLastScanned] = useState<LastScannedItem | null>(null);
  const [scanCooldown, setScanCooldown] = useState<{ [code: string]: number }>({});
  const [scanFlash, setScanFlash] = useState<'success' | 'error' | null>(null);

  // Stop current video stream
  const stopStream = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch {}
      zxingReaderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  // Handle detected barcode string
  const handleBarcodeDetected = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      // Prevent repeated burst scans of the same barcode within 2 seconds
      const now = Date.now();
      if (scanCooldown[code] && now - scanCooldown[code] < 2000) {
        return;
      }

      setScanCooldown((prev) => ({ ...prev, [code]: now }));
      setIsProcessing(true);

      // Trigger haptic vibration on mobile devices
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }

      try {
        const result = await onScan(code);

        if (result.success) {
          if (soundEnabled) playAudioFeedback('success');
          setScanFlash('success');
          setTimeout(() => setScanFlash(null), 600);

          setLastScanned({
            code,
            name: result.productName || 'Product Added',
            price: result.price,
            time: Date.now(),
          });

          if (!continuousMode) {
            // If single scan mode, close modal shortly after confirmation
            setTimeout(() => {
              onClose();
            }, 500);
          }
        } else {
          if (soundEnabled) playAudioFeedback('error');
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([60, 40, 60]);
          }
          setScanFlash('error');
          setTimeout(() => setScanFlash(null), 600);
        }
      } catch (err) {
        console.error('Scan handling error:', err);
      } finally {
        setTimeout(() => {
          setIsProcessing(false);
        }, 300);
      }
    },
    [continuousMode, onClose, onScan, scanCooldown, soundEnabled]
  );

  // Initialize camera and scanning engine
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setLastScanned(null);
      return;
    }

    let isMounted = true;

    const startCamera = async () => {
      setErrorMessage(null);
      stopStream();

      try {
        // Request rear camera with ideal high resolution for 1D/2D barcodes
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Check if flashlight / torch is supported
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.getCapabilities) {
          const capabilities = (videoTrack.getCapabilities() as any) || {};
          setHasTorch(Boolean(capabilities.torch));
        }

        // 1. Try Native BarcodeDetector API (fastest, hardware accelerated)
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: [
                'ean_13',
                'ean_8',
                'upc_a',
                'upc_e',
                'code_128',
                'code_39',
                'code_93',
                'qr_code',
                'itf',
                'data_matrix',
              ],
            });

            // Scan frames periodically (every 120ms)
            scanIntervalRef.current = window.setInterval(async () => {
              if (!videoRef.current || videoRef.current.readyState < 2) return;
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0) {
                  const first = barcodes[0].rawValue;
                  if (first) {
                    handleBarcodeDetected(first);
                  }
                }
              } catch {
                // Ignore transient frame detect errors
              }
            }, 120);

            return;
          } catch (detectorInitErr) {
            console.warn('BarcodeDetector initialization fallback:', detectorInitErr);
          }
        }

        // 2. Fallback: Dynamic ZXing library for browsers without native BarcodeDetector
        const loadZXing = async (): Promise<any> => {
          if ((window as any).ZXing) return (window as any).ZXing;
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
            script.async = true;
            script.onload = () => resolve((window as any).ZXing);
            script.onerror = () => reject(new Error('ZXing script load failure'));
            document.body.appendChild(script);
          });
        };

        try {
          const ZXing = await loadZXing();
          if (!isMounted || !videoRef.current) return;

          const reader = new ZXing.BrowserMultiFormatReader();
          zxingReaderRef.current = reader;

          reader.decodeFromVideoElement(videoRef.current, (result: any, _err: any) => {
            if (result && result.getText()) {
              handleBarcodeDetected(result.getText());
            }
          });
        } catch (zxingErr) {
          console.error('Failed to initialize barcode scanner engine:', zxingErr);
          setErrorMessage(
            'Barcode scanning is not supported by this browser. Please use Google Chrome or Edge on mobile, or enter barcodes manually.'
          );
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMessage('Camera access was denied. Please allow camera permissions in your browser address bar.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setErrorMessage('No camera device found on this system.');
        } else {
          setErrorMessage(`Unable to access camera: ${err.message || 'Unknown error'}`);
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [isOpen, facingMode, stopStream, handleBarcodeDetected]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setTorchOn(nextState);
    } catch {
      toast.error('Could not toggle flashlight.');
    }
  };

  // Toggle camera between rear and front
  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md transition-all p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-ink border-2 border-line rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90vh] sm:h-[620px] max-h-[700px]">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-ink/90 border-b border-white/10 z-20 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isProcessing ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isProcessing ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className="font-bold text-sm tracking-wide">
              {isProcessing ? 'Reading Barcode…' : 'POS Barcode Scanner'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Flashlight button */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border transition-colors ${
                  torchOn
                    ? 'bg-marigold text-ink border-marigold font-bold'
                    : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                }`}
                title={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
              >
                {torchOn ? <Flashlight size={16} /> : <FlashlightOff size={16} />}
              </button>
            )}

            {/* Switch Camera button */}
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="p-2 rounded-xl bg-white/10 text-white/80 border border-white/15 hover:bg-white/20 transition-colors"
              title={`Switch camera (Current: ${facingMode === 'environment' ? 'Rear' : 'Front'})`}
            >
              <RefreshCw size={16} />
            </button>

            {/* Sound Toggle button */}
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className="p-2 rounded-xl bg-white/10 text-white/80 border border-white/15 hover:bg-white/20 transition-colors"
              title={soundEnabled ? 'Mute scanner beep' : 'Enable scanner beep'}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 text-white/80 border border-white/15 hover:bg-white/20 hover:text-white transition-colors ml-1"
              id="close-camera-scanner-btn"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Viewfinder Video Area */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Flash feedback overlay on scan */}
          {scanFlash === 'success' && (
            <div className="absolute inset-0 bg-emerald-500/25 pointer-events-none transition-opacity duration-300 z-10" />
          )}
          {scanFlash === 'error' && (
            <div className="absolute inset-0 bg-rose-500/30 pointer-events-none transition-opacity duration-300 z-10" />
          )}

          {/* Translucent Dark Mask with Viewfinder Reticle */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Viewfinder Target Box */}
            <div className="relative w-64 sm:w-72 h-44 sm:h-48 rounded-2xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-teal rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-teal rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-teal rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-teal rounded-br-lg" />

              {/* Laser Scanning Animation */}
              <div
                className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-teal to-transparent shadow-[0_0_12px_#1D7874]"
                style={{
                  animation: 'scanLaser 2s ease-in-out infinite',
                }}
              />

              <style>{`
                @keyframes scanLaser {
                  0% { top: 10%; opacity: 0.7; }
                  50% { top: 90%; opacity: 1; }
                  100% { top: 10%; opacity: 0.7; }
                }
              `}</style>
            </div>
          </div>

          {/* Camera Error or Permission Denied Message */}
          {errorMessage && (
            <div className="absolute inset-0 bg-ink/95 flex flex-col items-center justify-center p-6 text-center z-30 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <AlertCircle size={24} />
              </div>
              <p className="text-sm text-white/90 max-w-xs">{errorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                }}
                className="btn-primary text-xs py-2 px-4 shadow-md"
              >
                Try Switching Camera
              </button>
            </div>
          )}

          {/* Last Scanned Item Card (Bottom of Viewfinder) */}
          {lastScanned && (
            <div className="absolute bottom-4 left-4 right-4 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-ink/95 border-2 border-teal rounded-2xl p-3.5 shadow-xl flex items-center justify-between text-white backdrop-blur-md">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-teal text-white flex items-center justify-center font-bold flex-shrink-0">
                    <Check size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate text-white leading-tight">
                      {lastScanned.name}
                    </p>
                    <p className="text-[11px] font-mono text-white/70 truncate mt-0.5">
                      Code: {lastScanned.code}
                    </p>
                  </div>
                </div>

                {lastScanned.price !== undefined && (
                  <div className="font-mono text-sm font-extrabold text-marigold flex-shrink-0 pl-2">
                    ₹{lastScanned.price.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Configuration & Guidance Controls */}
        <div className="px-4 py-3 bg-ink border-t border-white/10 z-20 flex items-center justify-between text-white text-xs">
          {/* Continuous Scan Toggle */}
          <button
            type="button"
            onClick={() => setContinuousMode((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors ${
              continuousMode
                ? 'bg-teal/20 text-teal-light border-teal'
                : 'bg-white/5 text-white/70 border-white/15'
            }`}
          >
            <Repeat size={14} className={continuousMode ? 'text-teal' : 'text-white/60'} />
            <span className="font-semibold">
              {continuousMode ? 'Multi-Scan (Continuous)' : 'Single Item Mode'}
            </span>
          </button>

          <span className="text-[11px] text-white/60 hidden xs:inline font-mono">
            Align barcode in box
          </span>
        </div>
      </div>
    </div>
  );
};
