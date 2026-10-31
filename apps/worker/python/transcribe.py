#!/usr/bin/env python3
"""Transcrição com tempo por palavra: faster-whisper (texto) + alinhamento forçado wav2vec2 (tempos).

Por quê: os tempos de palavra nativos do Whisper vêm sistematicamente adiantados (medido no corpus do projeto:
início ~175 ms cedo, só 43% dos inícios dentro de 150 ms). O alinhamento forçado (técnica do WhisperX) sobre o
texto reconhecido leva isso para ~98% dentro de 150 ms. Veja apps/worker/python/bench/RESULTADOS.md.

Uso: transcribe.py <arquivo_de_midia> <idioma> <modelo>
Saída (stdout): JSON {"language", "text", "aligner", "words": [{"w", "start_ms", "end_ms", "conf"}]}

Variáveis: WHISPER_DEVICE (cpu), WHISPER_COMPUTE_TYPE (int8), WHISPER_ALIGN (wav2vec2 | off).
"""
import json
import os
import sys


def fill_untimed(words, seg_start_ms, seg_end_ms):
    """Palavras sem tempo (números, símbolos) recebem tempo repartido entre as vizinhas que têm, por tamanho do texto."""
    n = len(words)
    i = 0
    while i < n:
        if words[i]["start_ms"] is not None:
            i += 1
            continue
        j = i
        while j < n and words[j]["start_ms"] is None:
            j += 1
        left = words[i - 1]["end_ms"] if i > 0 else seg_start_ms
        right = words[j]["start_ms"] if j < n else seg_end_ms
        right = max(right, left)
        weights = [max(1, len(words[k]["w"])) for k in range(i, j)]
        total = sum(weights)
        acc = left
        for k, wt in zip(range(i, j), weights):
            span = (right - left) * wt / total
            words[k]["start_ms"] = int(round(acc))
            words[k]["end_ms"] = int(round(acc + span))
            acc += span
        i = j


def align(segments, media, language, device):
    """Devolve a lista de palavras alinhadas, ou None se não houver modelo de alinhamento para o idioma."""
    import whisperx  # noqa: PLC0415

    try:
        model, meta = whisperx.load_align_model(language_code=language, device=device)
    except Exception as e:  # idioma sem modelo de alinhamento
        print(f"alinhamento indisponível para '{language}': {e}", file=sys.stderr)
        return None
    audio = whisperx.load_audio(media)
    aligned = whisperx.align(
        [{"text": s["text"], "start": s["start"], "end": s["end"]} for s in segments],
        model,
        meta,
        audio,
        device,
        return_char_alignments=False,
    )
    out = []
    for seg in aligned["segments"]:
        words = []
        for w in seg.get("words", []):
            timed = "start" in w and "end" in w
            words.append(
                {
                    "w": w["word"].strip(),
                    "start_ms": int(round(w["start"] * 1000)) if timed else None,
                    "end_ms": int(round(w["end"] * 1000)) if timed else None,
                    "conf": round(float(w.get("score", 0.0)), 4),
                }
            )
        fill_untimed(words, int(round(seg["start"] * 1000)), int(round(seg["end"] * 1000)))
        out.extend(words)
    return out


def main() -> int:
    if len(sys.argv) < 4:
        print("uso: transcribe.py <midia> <idioma> <modelo>", file=sys.stderr)
        return 2

    media, language, model_name = sys.argv[1], sys.argv[2], sys.argv[3]

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper não está instalado (pip install -r requirements.txt)", file=sys.stderr)
        return 3

    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
    want_align = os.environ.get("WHISPER_ALIGN", "wav2vec2") != "off"
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    segments_iter, info = model.transcribe(
        media,
        language=None if language == "auto" else language,
        word_timestamps=True,  # tempos nativos: plano B se o alinhamento não estiver disponível
        vad_filter=False,  # não deslocar tempos: o corte depende da precisão por palavra
        condition_on_previous_text=False,
        beam_size=5,
    )
    segments = list(segments_iter)

    texts = [s.text.strip() for s in segments]
    seg_dicts = [{"text": s.text.strip(), "start": s.start, "end": s.end} for s in segments if s.text.strip()]

    words = None
    aligner = "whisper-native"
    if want_align and seg_dicts:
        try:
            words = align(seg_dicts, media, info.language, device)
            if words is not None:
                aligner = "wav2vec2"
        except ImportError:
            print("whisperx não está instalado: usando os tempos nativos do Whisper (menos precisos)", file=sys.stderr)
    if words is None:
        words = []
        for seg in segments:
            for w in seg.words or []:
                words.append(
                    {
                        "w": w.word.strip(),
                        "start_ms": int(round(w.start * 1000)),
                        "end_ms": int(round(w.end * 1000)),
                        "conf": round(float(w.probability), 4),
                    }
                )

    json.dump(
        {"language": info.language, "text": " ".join(texts).strip(), "aligner": aligner, "words": words},
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
