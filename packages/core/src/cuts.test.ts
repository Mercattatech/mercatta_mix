import { describe, expect, it } from "vitest";
import { computeCut, CutError, snapToQuietPoint } from "./cuts";
import type { Word } from "./types";

const w = (text: string, start_ms: number, end_ms: number): Word => ({ w: text, start_ms, end_ms });

// "Oi pessoal, hoje eu vou mostrar"
const words: Word[] = [
  w("Oi", 500, 800),
  w("pessoal", 1000, 1600), // pausa de 200 antes
  w("hoje", 1650, 1900), // pausa curta (50) antes
  w("eu", 1900, 2000), // palavra colada na anterior
  w("vou", 2500, 2700),
  w("mostrar", 2800, 3300),
];

describe("computeCut", () => {
  it("aplica 100 ms antes e 150 ms depois quando a pausa permite", () => {
    // pausas de 700 antes de "vou" e 100 depois... usa palavras com espaço grande
    const spaced = [w("a", 1000, 1500), w("b", 2000, 2500), w("c", 4000, 4500)];
    const cut = computeCut(spaced, 1, 1, 10000);
    expect(cut.srcStartMs).toBe(1900); // 2000 - 100
    expect(cut.srcEndMs).toBe(2650); // 2500 + 150
  });

  it("primeira palavra do vídeo usa a margem inteira até o início do arquivo", () => {
    const cut = computeCut(words, 0, 0, 10000);
    expect(cut.srcStartMs).toBe(400);
  });

  it("limita a margem a no máximo metade da pausa (nunca invade a palavra vizinha)", () => {
    // "hoje" começa 50 ms depois do fim de "pessoal": margem antes = 25
    const cut = computeCut(words, 2, 2, 10000);
    expect(cut.srcStartMs).toBe(1625);
    // "hoje" termina e "eu" começa colado: margem depois = 0
    expect(cut.srcEndMs).toBe(1900);
  });

  it("palavras coladas: corte entre elas fica sem margem", () => {
    const cut = computeCut(words, 3, 3, 10000);
    expect(cut.srcStartMs).toBe(1900);
  });

  it("última palavra pode usar a margem até o fim do arquivo, mas não passa dele", () => {
    const cutEnd = computeCut(words, 5, 5, 3400);
    expect(cutEnd.srcEndMs).toBe(3400); // 3300 + 150 limitado a 3400
    const cutFar = computeCut(words, 5, 5, 10000);
    expect(cutFar.srcEndMs).toBe(3450);
  });

  it("intervalo com várias palavras usa início da 1ª e fim da última", () => {
    const cut = computeCut(words, 1, 3, 10000);
    expect(cut.firstWordStartMs).toBe(1000);
    expect(cut.lastWordEndMs).toBe(2000);
    expect(cut.srcStartMs).toBe(900); // pausa de 200 antes: 100
    expect(cut.srcEndMs).toBe(2150); // pausa de 500 depois: 150
  });

  it("palavras sobrepostas (timestamps ruins) não geram margem negativa", () => {
    const overlap = [w("a", 1000, 1600), w("b", 1500, 2000)];
    const cut = computeCut(overlap, 1, 1, 5000);
    expect(cut.srcStartMs).toBe(1500);
    expect(cut.srcEndMs).toBeGreaterThanOrEqual(2000);
  });

  it("erros em intervalos inválidos", () => {
    expect(() => computeCut(words, -1, 2, 5000)).toThrow(CutError);
    expect(() => computeCut(words, 3, 2, 5000)).toThrow(CutError);
    expect(() => computeCut(words, 0, 99, 5000)).toThrow(CutError);
    expect(() => computeCut(words, 0, 1, 0)).toThrow(CutError);
    expect(() => computeCut([w("x", 1000, 1000)], 0, 0, 5000)).toThrow(CutError);
  });

  it("ajusta o ponto de corte para o instante mais silencioso (dentro da pausa)", () => {
    const spaced = [w("a", 1000, 1500), w("b", 2000, 2500), w("c", 4000, 4500)];
    // passo de 10 ms; ruído alto em tudo, exceto 2620 ms (menor energia)
    const values = Array.from({ length: 600 }, (_, i) => (i === 262 ? 0 : 5));
    const cut = computeCut(spaced, 1, 1, 10000, { envelope: { stepMs: 10, values } });
    expect(cut.srcEndMs).toBe(2620); // alvo 2650, janela ±30
    // início: sem vale na janela → empate → o mais perto do alvo
    expect(cut.srcStartMs).toBe(1900);
  });

  it("o ajuste nunca atravessa a palavra", () => {
    const spaced = [w("a", 1000, 1500), w("b", 2000, 2500), w("c", 2600, 3000)];
    // vale de energia em 2500 ms (dentro da palavra "b" no limite) e em 2540
    const values = Array.from({ length: 400 }, (_, i) => (i === 249 ? 0 : 5));
    const cut = computeCut(spaced, 1, 1, 10000, { envelope: { stepMs: 10, values } });
    expect(cut.srcEndMs).toBeGreaterThanOrEqual(2500);
    expect(cut.srcEndMs).toBeLessThanOrEqual(2600);
  });
});

describe("snapToQuietPoint", () => {
  it("sem envelope útil devolve o alvo", () => {
    expect(snapToQuietPoint(1000, { stepMs: 10, values: [] }, 30, 0, 5000)).toBe(1000);
  });
  it("respeita os limites mínimo e máximo", () => {
    const values = Array.from({ length: 200 }, (_, i) => (i === 95 ? 0 : 1));
    // vale em 950, mas o mínimo é 980
    expect(snapToQuietPoint(1000, { stepMs: 10, values }, 100, 980, 5000)).toBeGreaterThanOrEqual(980);
  });
  it("em empate escolhe o mais perto do alvo", () => {
    const values = Array.from({ length: 200 }, () => 1);
    expect(snapToQuietPoint(1000, { stepMs: 10, values }, 30, 0, 5000)).toBe(1000);
  });
});
