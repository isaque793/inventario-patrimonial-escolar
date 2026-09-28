import Quagga, { QuaggaJSResultObject } from "@ericblade/quagga2";
import { Camera, Loader2, ScanLine, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type BarcodeScannerDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; onDetected: (code: string) => void };

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
    let isActive = true;
    let cameraStarted = false;
    const handleDetected = (result: QuaggaJSResultObject) => {
      if (!isActive) return;
      const code = result.codeResult?.code?.trim();
      if (!code || code.length < 3) return;
      isActive = false;
      setStatus("Código lido com sucesso.");
      onDetectedRef.current(code);
      if (cameraStarted) Quagga.stop();
      Quagga.offDetected(handleDetected);
    };
    setStatus("Solicitando permissão para usar a câmera...");
    setIsStarting(true);
    Quagga.init({ inputStream: { type: "LiveStream", target: viewportElement, constraints: { width: { min: 640, ideal: 1280 }, height: { min: 480, ideal: 720 }, facingMode: "environment" } }, locator: { patchSize: "medium", halfSample: true }, numOfWorkers: Math.max(1, navigator.hardwareConcurrency || 2), decoder: { readers: ["code_128_reader", "code_39_reader", "i2of5_reader", "ean_reader", "ean_8_reader"] }, locate: true }, error => {
      if (!isActive) return;
      setIsStarting(false);
      if (error) { console.error("Erro ao iniciar leitor de código de barras:", error); setStatus("Não foi possível acessar a câmera. Autorize o uso ou digite o código manualmente."); return; }
      setStatus("Câmera ativa. Aponte o código de barras para a linha central.");
      Quagga.onDetected(handleDetected);
      Quagga.start();
      cameraStarted = true;
      setIsStarting(false);
    });
    return () => { isActive = false; Quagga.offDetected(handleDetected); if (cameraStarted) Quagga.stop(); };
  }, [open, viewportElement]);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg overflow-hidden p-0"><DialogHeader className="px-6 pt-6"><DialogTitle className="flex items-center gap-2 text-[#173b30]"><Camera className="size-5 text-[#0b5d4b]" /> Ler patrimônio pela câmera</DialogTitle><DialogDescription>Posicione o código de barras dentro da área central. A câmera será desligada assim que o código for reconhecido.</DialogDescription></DialogHeader><div ref={setViewportElement} className="relative mx-6 aspect-video overflow-hidden rounded-2xl bg-[#071d17] [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:object-cover [&>video]:absolute [&>video]:inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"><div className="pointer-events-none absolute inset-x-[10%] top-1/2 z-10 h-0.5 bg-[#f87171] shadow-[0_0_8px_rgba(248,113,113,.9)]" /><div className="pointer-events-none absolute inset-0 z-10 border-[18px] border-black/20" />{isStarting && <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#071d17]/80"><Loader2 className="size-8 animate-spin text-white" /></div>}</div><p className="px-6 text-sm leading-5 text-[#62766a]" aria-live="polite">{status}</p><DialogFooter className="px-6 pb-6"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}><X className="mr-2 size-4" /> Fechar câmera</Button><div className="flex items-center gap-2 text-xs text-[#718277]"><ScanLine className="size-4" /> Entrada manual disponível</div></DialogFooter></DialogContent></Dialog>;
}
