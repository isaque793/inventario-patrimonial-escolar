import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Área com rolagem própria que mostra no máximo `visible` itens (padrão: 6).
 * A altura é medida nas próprias linhas, então funciona com itens de alturas
 * diferentes (descrições em duas linhas, por exemplo).
 *
 * Como usar:
 *   - marque cada item (linha <tr> ou bloco) com o atributo `data-list-item`;
 *   - em tabelas, o <thead> fica fixo no topo automaticamente;
 *   - um rodapé que deve ficar sempre visível (ex.: <tfoot> de total) recebe
 *     `data-list-footer` e a classe `sticky bottom-0`.
 *
 * Com `visible` itens ou menos, a lista mostra tudo e não cria rolagem.
 * Não usa ResizeObserver (ver notes/resizeobserver_investigacao.md): mede ao
 * renderizar e quando a janela muda de tamanho.
 */
export function ScrollableList({
  visible = 6,
  className,
  children,
}: {
  visible?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  const measure = () => {
    const element = ref.current;
    if (!element) return;
    const items = element.querySelectorAll<HTMLElement>("[data-list-item]");
    let next: number | undefined;
    if (items.length > visible) {
      const containerTop = element.getBoundingClientRect().top;
      // Distância do topo do conteúdo até o primeiro item que deve ficar escondido.
      const cutAt = items[visible].getBoundingClientRect().top - containerTop + element.scrollTop;
      const footer = Array.from(element.querySelectorAll<HTMLElement>("[data-list-footer]")).reduce(
        (sum, node) => sum + node.getBoundingClientRect().height,
        0,
      );
      // Barra de rolagem horizontal (tabela larga em tela estreita) também ocupa altura.
      const horizontalScrollbar = element.offsetHeight - element.clientHeight;
      next = Math.ceil(cutAt + footer + horizontalScrollbar);
    }
    setMaxHeight(current => (current === next ? current : next));
  };

  // Mede depois de cada renderização (lista mudou) — só atualiza se a altura mudar.
  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    // Fontes carregadas depois mudam a altura das linhas.
    document.fonts?.ready.then(onResize).catch(() => undefined);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      ref={ref}
      style={maxHeight ? { maxHeight } : undefined}
      className={cn(
        "overflow-auto",
        "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10",
        "[&_[data-list-footer]]:z-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
