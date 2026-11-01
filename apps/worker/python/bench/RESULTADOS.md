# Transcrição: o que foi medido e o que foi escolhido

**Escolha para produção:** `faster-whisper large-v3-turbo` (texto) + alinhamento forçado `wav2vec2` (tempo de cada palavra, técnica do WhisperX).
Tempo de palavra é o que decide a qualidade do corte, da legenda e da emenda; por isso ele foi o critério principal.

## Como foi medido

- Corpus gerado por `make_corpus.py`: 16 frases de marketing em pt-BR, voz Luciana (macOS) em 3 velocidades de fala
  (150, 185 e 230 palavras/min), em duas variantes (limpa e com ruído de ambiente a ~12 dB). Total: 96 arquivos, 1.116 palavras.
- Cada palavra é sintetizada separadamente e montada com pausas de 20 a 250 ms, então o **início e o fim reais de cada palavra são conhecidos**.
- `bench.py` compara o resultado de cada motor com essa verdade: erro de palavras (WER) e erro de início/fim por palavra.
- As outras vozes pt-BR do macOS (Eddy, Flo, Reed, Rocko, Shelley) foram descartadas: são vozes de efeito que nem o Whisper entende
  (WER 57–92% contra 2% da Luciana).

## Resultados (corpus limpo / com ruído)

| Motor | WER | Início ≤150 ms | Fim ≤150 ms | Viés início / fim |
|---|---|---|---|---|
| Whisper `small`, tempos nativos | 10,6% / 11,1% | 42,7% / 34,6% | 73,6% / 73,4% | −175 / −93 ms |
| Whisper `medium`, tempos nativos | 9,0% / 7,7% | 83,4% / 84,8% | 78,9% / 67,6% | +3 / +87 ms |
| Whisper `large-v3-turbo`, tempos nativos | 6,1% / 6,6% | 43,6% / 41,1% | 83,6% / 84,7% | −176 / −76 ms |
| `small` + alinhamento wav2vec2 | 10,8% / 11,6% | 97,8% / 93,8% | 98,2% / 87,9% | +44 / −16 ms |
| **`large-v3-turbo` + alinhamento wav2vec2** | **6,1% / 6,6%** | **95,0% / 95,8%** | **95,2% / 93,1%** | **+42 / −20 ms** |

Leitura:
- O modelo maior melhora o **texto** (WER 10,6% → 6,1%), mas os tempos nativos continuam ruins e inconsistentes
  (adiantados no `small` e `turbo`, atrasados no fim do `medium`).
- O alinhamento forçado é o que melhora o **tempo**: de ~43% para ~95% dos inícios dentro de 150 ms, com viés pequeno.
- O viés residual (início ~40 ms tarde, fim ~20 ms cedo) cabe nas folgas do corte (100 ms antes, 150 ms depois) e no fade de 50 ms.

## Limites desta medição (importante)

- É **voz sintética** com palavras isoladas: serve para comparar motores e medir erro de borda, **não** para prever a taxa de acerto
  em gravação real com sotaque, música de fundo ou fala sobreposta. O número de WER aqui inclui divergências de grafia
  (ex.: "dezessete" escrito como "17"), que penalizam todos os motores igualmente.
- Os tempos de execução registrados nas rodadas longas **não são confiáveis** (o computador entrou em repouso durante a medição).
  A referência prática é o tempo de CPU: cerca de 47 s para um áudio de 9 s numa única chamada, **incluindo carregar os dois modelos**.
  Em servidor a carga dos modelos é paga por vídeo; um vídeo de até 3 minutos deve levar de alguns minutos em CPU.
- Antes de valer como garantia, repetir com 3 a 5 gravações reais de clientes (a medição acima é a ferramenta: basta marcar à mão
  o início/fim de ~30 palavras de cada vídeo e comparar).

## Como repetir

```bash
python3.11 -m venv apps/worker/python/.venv
apps/worker/python/.venv/bin/pip install -r apps/worker/python/requirements.txt numpy
apps/worker/python/.venv/bin/python apps/worker/python/bench/make_corpus.py tmp/asr-bench/corpus   # somente macOS
apps/worker/python/.venv/bin/python apps/worker/python/bench/bench.py tmp/asr-bench/corpus fw:small wx:large-v3-turbo
```
