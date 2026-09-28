import Quagga, { QuaggaJSResultObject } from "@ericblade/quagga2";
import { Camera, Loader2, ScanLine, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type BarcodeScannerDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; onDetected: (code: string) => void };

// API nativa do navegador (Chrome/Android). Não existe em todos os navegadores, por isso há reserva com Quagga.
type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = { new (options?: { formats?: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> };

// As etiquetas de patrimônio são Code 39. Code 128 e ITF ficam habilitados por causa de outros modelos de plaqueta.
const NATIVE_FORMATS = ["code_39", "code_128", "itf"];
const QUAGGA_READERS = ["code_128_reader", "code_39_reader", "i2of5_reader"] as const;
// Formato esperado do patrimônio: 7 ou 8 dígitos, com dígito verificador opcional (ex.: 5916675-4).
// Ajuste aqui se surgirem números fora desse padrão. null = aceita qualquer valor.
const EXPECTED_PATTERN: RegExp | null = /^\d{7,8}(-\d)?$/;
// Code 39 não tem dígito verificador: por isso o mesmo valor precisa ser lido várias vezes seguidas.
const REQUIRED_MATCHES = 3;
const READ_WINDOW_MS = 2500;
// Erro mediano máximo aceito por leitura no Quagga (0 = perfeita).
const MAX_MEDIAN_ERROR = 0.15;
// Intervalo entre tentativas do leitor nativo e tempo até trocar automaticamente para o Quagga.
const NATIVE_INTERVAL_MS = 80;
const NATIVE_TIMEOUT_MS = 8000;

const READING_STATUS = "Lendo... mantenha o celular firme sobre o código.";
const ACTIVE_STATUS = "Câmera ativa. Aponte o código de barras para a linha central.";

function medianError(result: QuaggaJSResultObject): number {
  const errors = (result.codeResult?.decodedCodes ?? [])
    .map(item => item.error)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);
  if (!errors.length) return 0;
  return errors[Math.floor(errors.length / 2)];
}

function normalizeCode(raw: string | null | undefined): string | null {
  const code = raw?.trim();
  if (!code || code.length < 3) return null;
  if (EXPECTED_PATTERN && !EXPECTED_PATTERN.test(code)) return null;
  return code;
}

// Retorna true quando o mesmo código foi lido REQUIRED_MATCHES vezes consecutivamente dentro da janela de tempo.
function createConsensus() {
  let lastCode: string | null = null;
  let matches = 0;
  let lastReadAt = 0;

  return (code: string): boolean => {
    const now = Date.now();

    if (code !== lastCode || now - lastReadAt > READ_WINDOW_MS) {
      lastCode = code;
      matches = 1;
    } else {
      matches += 1;
    }

    lastReadAt = now;
    return matches >= REQUIRED_MATCHES;
  };
}

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: BarcodeScannerDialogProps) {
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Aguardando acesso à câmera...");
  const [isStarting, setIsStarting] = useState(false);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open || !viewportElement) return;
    const viewport = viewportElement;
    let disposed = false;
    let finished = false;
    let stopEngine: () => void = () => {};
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (code: string) => {
      if (disposed || finished) return;
      finished = true;
      clearTimeout(fallbackTimer);
      setStatus("Código lido com sucesso.");
      stopEngine();
      onDetectedRef.current(code);
    };

    // Leitor de reserva (Quagga): funciona em qualquer navegador com câmera.
    const startQuagga = () => {
      const accept = createConsensus();
      let active = true;
      let started = false;
      const handleDetected = (result: QuaggaJSResultObject) => {
        if (!active) return;
        const code = normalizeCode(result.codeResult?.code);
        if (!code || medianError(result) > MAX_MEDIAN_ERROR) return;
        if (!accept(code)) { setStatus(READING_STATUS); return; }
        finish(code);
      };

      setStatus("Solicitando permissão para usar a câmera...");
      setIsStarting(true);
      Quagga.init({
        inputStream: {
          type: "LiveStream",
          target: viewport,
          constraints: {
            width: { min: 640, ideal: 1920 },
            height: { min: 480, ideal: 1080 },
            facingMode: "environment",
            advanced: [{ focusMode: "continuous" }] as any,
          },
          // Lê só a faixa central (onde fica a linha vermelha), ignorando ruído das bordas.
          area: { top: "30%", bottom: "30%", left: "10%", right: "10%" },
        },
        locator: { patchSize: "medium", halfSample: false },
        numOfWorkers: Math.max(1, navigator.hardwareConcurrency || 2),
        frequency: 10,
        decoder: { readers: [...QUAGGA_READERS] },
        locate: true,
      }, error => {
        if (!active) { if (!error) Quagga.stop(); return; }
        setIsStarting(false);
        if (error) { console.error("Erro ao iniciar leitor de código de barras:", error); setStatus("Não foi possível acessar a câmera. Autorize o uso ou digite o código manualmente."); return; }
        setStatus(ACTIVE_STATUS);
        Quagga.onDetected(handleDetected);
        Quagga.start();
        started = true;
      });

      return () => { active = false; Quagga.offDetected(handleDetected); if (started) Quagga.stop(); };
    };

    const switchToQuagga = () => {
      stopEngine();
      stopEngine = startQuagga();
    };

    // Leitor nativo do navegador (BarcodeDetector): mais preciso e tolerante a desfoque e rotação.
    const startNative = (Detector: NativeDetectorCtor, formats: string[], onReady: () => void, onFail: () => void) => {
      const accept = createConsensus();
      let active = true;
      let stream: MediaStream | null = null;
      let video: HTMLVideoElement | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        active = false;
        clearTimeout(timer);
        stream?.getTracks().forEach(track => track.stop());
        video?.remove();
      };

      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: "continuous" }] as any,
            },
            audio: false,
          });

          if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
          video = document.createElement("video");
          video.setAttribute("playsinline", "true");
          video.muted = true;
          video.srcObject = stream;
          viewport.appendChild(video);
          await video.play();
          if (!active) return;

          const detector = new Detector({ formats });
          setIsStarting(false);
          setStatus(ACTIVE_STATUS);
          onReady();

          const tick = async () => {
            if (!active || !video) return;
            try {
              const found = await detector.detect(video);
              for (const item of found) {
                const code = normalizeCode(item.rawValue);
                if (!code) continue;
                if (accept(code)) { finish(code); return; }
                setStatus(READING_STATUS);
              }
            } catch {
              // frame sem imagem utilizável: tenta de novo no próximo ciclo
            }
            if (active) timer = setTimeout(tick, NATIVE_INTERVAL_MS);
          };
          tick();
        } catch (error) {
          if (!active) return;
          console.error("Leitor nativo indisponível, usando leitor de reserva:", error);
          onFail();
        }
      })();

      return stop;
    };

    setStatus("Solicitando permissão para usar a câmera...");
    setIsStarting(true);
    const Detector = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
    if (Detector && typeof navigator.mediaDevices?.getUserMedia === "function") {
      (async () => {
        let formats = NATIVE_FORMATS;
        try {
          if (Detector.getSupportedFormats) {
            const supported = await Detector.getSupportedFormats();
            formats = NATIVE_FORMATS.filter(format => supported.includes(format));
          }
        } catch {
          formats = [];
        }

        if (disposed) return;
        if (!formats.includes("code_39")) { stopEngine = startQuagga(); return; }
        stopEngine = startNative(
          Detector,
          formats,
          // Se o nativo não confirmar nenhum código a tempo, troca sozinho para o Quagga.
          () => { fallbackTimer = setTimeout(() => { if (!finished && !disposed) switchToQuagga(); }, NATIVE_TIMEOUT_MS); },
          () => { if (!finished && !disposed) switchToQuagga(); },
        );
      })();
    } else {
      stopEngine = startQuagga();
    }

    return () => { disposed = true; clearTimeout(fallbackTimer); stopEngine(); };
  }, [open, viewportElement]);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg overflow-hidden p-0"><DialogHeader className="px-6 pt-6"><DialogTitle className="flex items-center gap-2 text-[#173b30]"><Camera className="size-5 text-[#0b5d4b]" /> Ler patrimônio pela câmera</DialogTitle><DialogDescription>Posicione o código de barras dentro da área central. A câmera será desligada assim que o código for reconhecido.</DialogDescription></DialogHeader><div ref={setViewportElement} className="relative mx-6 aspect-video overflow-hidden rounded-2xl bg-[#071d17] [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:object-cover [&>video]:absolute [&>video]:inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"><div className="pointer-events-none absolute inset-x-[10%] top-1/2 z-10 h-0.5 bg-[#f87171] shadow-[0_0_8px_rgba(248,113,113,.9)]" /><div className="pointer-events-none absolute inset-0 z-10 border-[18px] border-black/20" />{isStarting && <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#071d17]/80"><Loader2 className="size-8 animate-spin text-white" /></div>}</div><p className="px-6 text-sm leading-5 text-[#62766a]" aria-live="polite">{status}</p><DialogFooter className="px-6 pb-6"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}><X className="mr-2 size-4" /> Fechar câmera</Button><div className="flex items-center gap-2 text-xs text-[#718277]"><ScanLine className="size-4" /> Entrada manual disponível</div></DialogFooter></DialogContent></Dialog>;
}
