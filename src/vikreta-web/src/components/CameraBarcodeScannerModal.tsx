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
  RefreshCw,
  Barcode
} from 'lucide-react';
import { 
  BrowserMultiFormatReader, 
  BarcodeFormat, 
  DecodeHintType 
} from '@zxing/library';
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
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

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
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastScanned, setLastScanned] = useState<LastScannedItem | null>(null);
  const [scanCooldown, setScanCooldown] = useState<{ [code: string]: number }>({});
  const [scanFlash, setScanFlash] = useState<'success' | 'error' | null>(null);
  const [manualCode, setManualCode] = useState('');

  // Stop current video stream & decoder
  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch {}
      readerRef.current = null;
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

  // Initialize ZXing barcode engine with high-resolution constraints
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setLastScanned(null);
      return;
    }

    let isMounted = true;

    const startScanner = async () => {
      setErrorMessage(null);
      stopScanner();

      try {
        // Configure comprehensive barcode formats including all retail 1D & 2D formats
        const hints = new Map();
        const formats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.CODABAR,
        ];
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        // TRY_HARDER enables enhanced edge analysis & multiple contrast sweeps for difficult labels
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, 100);
        readerRef.current = reader;

        // Enumerate video input devices
        const devices = await reader.listVideoInputDevices().catch(() => []);
        if (isMounted && devices.length > 0) {
          setVideoDevices(devices);
        }

        if (!videoRef.current || !isMounted) return;

        // High-resolution video constraints for sharp 1D barcode lines
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        };

        if (selectedDeviceId) {
          videoConstraints.deviceId = { exact: selectedDeviceId };
        } else {
          videoConstraints.facingMode = { ideal: facingMode };
        }

        await reader.decodeFromConstraints(
          { video: videoConstraints, audio: false },
          videoRef.current,
          (result) => {
            if (!isMounted) return;
            if (result) {
              const text = result.getText();
              if (text) {
                handleBarcodeDetected(text);
              }
            }
          }
        );

        // Check if flashlight / torch is supported
        const stream = videoRef.current.srcObject as MediaStream | null;
        if (stream) {
          const track = stream.getVideoTracks()[0];
          if (track && track.getCapabilities) {
            const caps = (track.getCapabilities() as any) || {};
            setHasTorch(Boolean(caps.torch));
          }
        }
      } catch (err: any) {
        console.error('Camera barcode scanner error:', err);
        if (isMounted) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMessage('Camera access was denied. Please allow camera permissions in your browser address bar.');
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMessage('No camera device found on this system.');
          } else {
            setErrorMessage(`Unable to start camera scanner: ${err.message || 'Unknown error'}`);
          }
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen, facingMode, selectedDeviceId, stopScanner, handleBarcodeDetected]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as any],
      });
      setTorchOn(nextState);
    } catch {
      toast.error('Could not toggle flashlight on this camera.');
    }
  };

  // Switch camera between rear and front or next device
  const toggleCamera = () => {
    if (videoDevices.length > 1) {
      const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextIndex = (currentIndex + 1) % videoDevices.length;
      setSelectedDeviceId(videoDevices[nextIndex].deviceId);
    } else {
      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    }
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
      <div className="relative w-full max-w-lg bg-ink border-2 border-line rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90vh] sm:h-[640px] max-h-[720px]">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-ink/95 border-b border-white/10 z-20 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                  isProcessing ? 'bg-amber-400' : 'bg-emerald-400'
                } opacity-75`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isProcessing ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              ></span>
            </span>
            <span className="font-bold text-sm tracking-wide">
              {isProcessing ? 'Processing Barcode…' : 'POS Barcode Scanner'}
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
              onClick={toggleCamera}
              className="p-2 rounded-xl bg-white/10 text-white/80 border border-white/15 hover:bg-white/20 transition-colors"
              title="Switch camera"
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
            <div className="relative w-64 sm:w-80 h-44 sm:h-52 rounded-2xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
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

          {/* User Alignment Guidance Hint */}
          <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none z-10">
            <span className="bg-black/60 backdrop-blur-md text-white/90 text-xs px-3 py-1 rounded-full border border-white/15 shadow-sm">
              Point camera at barcode (15–20 cm away)
            </span>
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
                  toggleCamera();
                }}
                className="btn-primary text-xs py-2 px-4 shadow-md"
              >
                Switch Camera / Try Again
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

        {/* Bottom Configuration & Manual Fallback Controls */}
        <div className="p-3 bg-ink border-t border-white/10 z-20 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-white text-xs">
          {/* Continuous Scan Toggle */}
          <button
            type="button"
            onClick={() => setContinuousMode((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors flex-shrink-0 ${
              continuousMode
                ? 'bg-teal/20 text-teal-light border-teal'
                : 'bg-white/5 text-white/70 border-white/15'
            }`}
          >
            <Repeat size={14} className={continuousMode ? 'text-teal' : 'text-white/60'} />
            <span className="font-semibold">
              {continuousMode ? 'Continuous Mode' : 'Single Item Mode'}
            </span>
          </button>

          {/* Manual Barcode Input Fallback (for torn, faded, or damaged barcodes) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualCode.trim()) {
                handleBarcodeDetected(manualCode.trim());
                setManualCode('');
              }
            }}
            className="flex items-center gap-1.5 w-full sm:w-auto flex-1 max-w-sm"
          >
            <div className="relative flex-1">
              <Barcode size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Can't scan? Type barcode or SKU…"
                className="bg-white/10 text-white placeholder-white/50 text-xs pl-8 pr-2.5 py-1.5 rounded-xl border border-white/20 font-mono w-full focus:outline-none focus:border-teal"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-3 py-1.5 bg-teal text-white rounded-xl text-xs font-bold hover:bg-teal-dark disabled:opacity-40 flex-shrink-0 transition-colors shadow-xs"
            >
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
