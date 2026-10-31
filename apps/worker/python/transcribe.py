#!/usr/bin/env python3
"""Transcrição com tempo por palavra usando faster-whisper (roda no worker, sem custo por minuto).

Uso: transcribe.py <arquivo_de_midia> <idioma> <modelo>
Saída (stdout): JSON {"language", "text", "words": [{"w", "start_ms", "end_ms", "conf"}]}
"""
import json
import os
import sys


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
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    segments, info = model.transcribe(
        media,
        language=None if language == "auto" else language,
        word_timestamps=True,
        vad_filter=False,  # não deslocar tempos: o corte depende da precisão por palavra
        condition_on_previous_text=False,
        beam_size=5,
    )

    words = []
    texts = []
    for seg in segments:
        texts.append(seg.text.strip())
        for w in seg.words or []:
            words.append(
                {
                    "w": w.word.strip(),
                    "start_ms": int(round(w.start * 1000)),
                    "end_ms": int(round(w.end * 1000)),
                    "conf": round(float(w.probability), 4),
                }
            )

    json.dump({"language": info.language, "text": " ".join(texts).strip(), "words": words}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
