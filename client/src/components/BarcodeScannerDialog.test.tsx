// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarcodeScannerDialog } from "./BarcodeScannerDialog";

type FakeResult = { codeResult: { code: string | null; decodedCodes?: { error?: number }[] } };
let detectedCallback: ((result: FakeResult) => void) | undefined;
let initError: Error | null = null;

vi.mock("@ericblade/quagga2", () => ({
  default: {
    init: vi.fn((_config: unknown, callback: (error: Error | null) => void) => callback(initError)),
    onDetected: vi.fn((callback: typeof detectedCallback) => { detectedCallback = callback; }),
    offDetected: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

describe("BarcodeScannerDialog", () => {
  afterEach(() => cleanup());
  beforeEach(() => { initError = null; detectedCallback = undefined; });

  it("ativa a câmera e retorna o código lido após três leituras consecutivas", async () => {
    const onDetected = vi.fn();
    render(<BarcodeScannerDialog open onOpenChange={vi.fn()} onDetected={onDetected} />);
    expect(await screen.findByText("Câmera ativa. Aponte o código de barras para a linha central.")).toBeTruthy();

    const good = { codeResult: { code: "5916675-4", decodedCodes: [{ error: 0.02 }, { error: 0.05 }] } };
    detectedCallback?.(good);
    detectedCallback?.(good);
    expect(onDetected).not.toHaveBeenCalled();
    detectedCallback?.(good);

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith("5916675-4");
  });

  it("exige leituras consecutivas e ignora leituras divergentes ou com erro alto", async () => {
    const onDetected = vi.fn();
    render(<BarcodeScannerDialog open onOpenChange={vi.fn()} onDetected={onDetected} />);
    await screen.findByText("Câmera ativa. Aponte o código de barras para a linha central.");

    const good = { codeResult: { code: "1234567", decodedCodes: [{ error: 0.03 }] } };
    const wrong = { codeResult: { code: "1234657", decodedCodes: [{ error: 0.03 }] } };
    const noisy = { codeResult: { code: "9999999", decodedCodes: [{ error: 0.4 }] } };

    detectedCallback?.(good);
    detectedCallback?.(wrong);
    detectedCallback?.(good);
    detectedCallback?.(good);
    expect(onDetected).not.toHaveBeenCalled();

    detectedCallback?.(good);
    expect(onDetected).toHaveBeenCalledWith("1234567");

    detectedCallback?.(noisy);
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it("rejeita códigos fora do padrão de patrimônio", async () => {
    const onDetected = vi.fn();
    render(<BarcodeScannerDialog open onOpenChange={vi.fn()} onDetected={onDetected} />);
    await screen.findByText("Câmera ativa. Aponte o código de barras para a linha central.");

    const strange = { codeResult: { code: "ABC12", decodedCodes: [{ error: 0.01 }] } };
    for (let i = 0; i < 5; i++) detectedCallback?.(strange);

    expect(onDetected).not.toHaveBeenCalled();
  });

  it("informa que a digitação manual continua disponível quando a câmera falha", async () => {
    initError = new Error("permission denied");
    render(<BarcodeScannerDialog open onOpenChange={vi.fn()} onDetected={vi.fn()} />);

    expect(await screen.findByText("Não foi possível acessar a câmera. Autorize o uso ou digite o código manualmente.")).toBeTruthy();
    expect(screen.getByText("Entrada manual disponível")).toBeTruthy();
  });

  it("permite fechar o leitor", () => {
    const onOpenChange = vi.fn();
    render(<BarcodeScannerDialog open onOpenChange={onOpenChange} onDetected={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar câmera" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  describe("leitor nativo (BarcodeDetector)", () => {
    const trackStop = vi.fn();
    const detect = vi.fn();
    let supported = ["code_39", "code_128", "itf"];

    beforeEach(() => {
      trackStop.mockClear();
      detect.mockReset();
      supported = ["code_39", "code_128", "itf"];

      class FakeDetector {
        static getSupportedFormats = vi.fn(async () => supported);
        detect = detect;
      }

      (window as any).BarcodeDetector = FakeDetector;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value: vi.fn(async () => {}),
      });
    });

    afterEach(() => { delete (window as any).BarcodeDetector; });

    it("usa o leitor nativo e só aceita após três leituras consecutivas", async () => {
      detect.mockResolvedValue([{ rawValue: "68224184" }]);
      const onDetected = vi.fn();

      render(<BarcodeScannerDialog open onOpenChange={vi.fn()} onDetected={onDetected} />);

      await waitFor(() => expect(onDetected).toHaveBeenCalledWith("68224184"), { timeout: 3000 });
      expect(detect.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(onDetected).toHaveBeenCalledTimes(1);
      expect(trackStop).toHaveBeenCalled();
    });

    it("usa o Quagga quando o navegador não suporta Code 39", async () => {
      supported = ["qr_code"];
      render(<BarcodeScannerDialog open onOpenChange={vi.fn()} onDetected={vi.fn()} />);

      expect(await screen.findByText("Câmera ativa. Aponte o código de barras para a linha central.")).toBeTruthy();
      expect(detect).not.toHaveBeenCalled();
    });
  });
});
