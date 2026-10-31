#!/usr/bin/env python3
"""Mede a precisão de transcrição + tempo por palavra de cada motor contra a verdade conhecida do corpus.

Uso: bench.py <pasta_do_corpus> <motor> [<motor> ...]
Motores:
  fw:<modelo>            faster-whisper com tempos de palavra nativos (cross-attention)
  fw:<modelo>:vad        idem, com filtro de voz (VAD) ligado
  wx:<modelo>            faster-whisper + alinhamento forçado wav2vec2 (técnica do WhisperX) — exige `pip install whisperx`
Saída: tabela com WER e erro de borda (início e fim de cada palavra) por variante (limpo / ruído).
"""
import difflib
import json
import os
import statistics
import sys
import time
import unicodedata


def norm(w: str) -> str:
    w = unicodedata.normalize("NFD", w.lower())
    return "".join(c for c in w if c.isalnum())


def wer(ref: list, hyp: list) -> float:
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
            prev, d[j] = d[j], cur
    return d[len(hyp)] / max(1, len(ref))


def load_fw(model_name: str):
    from faster_whisper import WhisperModel

    return WhisperModel(model_name, device="cpu", compute_type="int8")


def run_fw(model, path: str, vad: bool):
    segments, _ = model.transcribe(path, language="pt", word_timestamps=True, vad_filter=vad, condition_on_previous_text=False, beam_size=5)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "start_ms": w.start * 1000, "end_ms": w.end * 1000})
    return words


def run_wx(model, path: str, state: dict):
    import whisperx  # noqa: PLC0415

    audio = whisperx.load_audio(path)
    segments, _ = model.transcribe(path, language="pt", word_timestamps=False, vad_filter=False, condition_on_previous_text=False, beam_size=5)
    segs = [{"text": s.text.strip(), "start": s.start, "end": s.end} for s in segments]
    if "align" not in state:
        state["align"] = whisperx.load_align_model(language_code="pt", device="cpu")
    am, meta = state["align"]
    aligned = whisperx.align(segs, am, meta, audio, "cpu", return_char_alignments=False)
    words = []
    for s in aligned["segments"]:
        for w in s.get("words", []):
            if "start" in w and "end" in w:
                words.append({"w": w["word"], "start_ms": w["start"] * 1000, "end_ms": w["end"] * 1000})
    return words


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


def evaluate(items, transcribe):
    res = {}
    by_voice: dict = {}
    total_audio = 0.0
    t0 = time.time()
    for it in items:
        truth = it["words"]
        total_audio += truth[-1]["end_ms"] / 1000 + 0.5
        hyp = transcribe(it["file"])
        ref_n = [norm(w["w"]) for w in truth]
        hyp_n = [norm(w["w"]) for w in hyp]
        r = res.setdefault(it["variant"], {"wer": [], "ds": [], "de": [], "n": 0, "matched": 0})
        r["wer"].append((wer(ref_n, hyp_n), len(ref_n)))
        by_voice.setdefault(it["voice"], []).append((wer(ref_n, hyp_n), len(ref_n)))
        r["n"] += len(ref_n)
        sm = difflib.SequenceMatcher(a=ref_n, b=hyp_n, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    t, h = truth[i1 + k], hyp[j1 + k]
                    r["ds"].append(h["start_ms"] - t["start_ms"])
                    r["de"].append(h["end_ms"] - t["end_ms"])
                    r["matched"] += 1
    elapsed = time.time() - t0
    return res, by_voice, elapsed, total_audio


def report(name, res, by_voice, elapsed, audio):
    print("WER por voz: " + "  ".join(f"{v}={sum(a * n for a, n in xs) / sum(n for _, n in xs) * 100:.0f}%" for v, xs in sorted(by_voice.items())))
    print(f"\n== {name}   (tempo {elapsed:.0f}s para {audio:.0f}s de áudio = {elapsed / audio:.2f}x do tempo real)")
    print(f"{'variante':8} {'WER':>6} {'casadas':>8} | {'INÍCIO: viés':>12} {'|med|':>6} {'p95':>6} {'máx':>6} {'≤150ms':>7} | {'FIM: viés':>10} {'|med|':>6} {'p95':>6} {'máx':>6} {'≤150ms':>7}")
    summary = {}
    for variant, r in sorted(res.items()):
        w = sum(a * n for a, n in r["wer"]) / sum(n for _, n in r["wer"])
        row = {"wer": round(w, 4), "matched": r["matched"], "n": r["n"]}
        parts = []
        for key in ("ds", "de"):
            xs = r[key]
            ab = [abs(x) for x in xs]
            row[key] = {
                "bias": round(statistics.median(xs)),
                "med": round(statistics.median(ab)),
                "p95": round(pct(ab, 95)),
                "max": round(max(ab)),
                "within150": round(sum(1 for a in ab if a <= 150) / len(ab), 4),
            }
            d = row[key]
            parts.append(f"{d['bias']:>+12} {d['med']:>6} {d['p95']:>6} {d['max']:>6} {d['within150'] * 100:>6.1f}%")
        summary[variant] = row
        print(f"{variant:8} {w * 100:>5.1f}% {r['matched']:>4}/{r['n']:<3} | {parts[0]} | {parts[1]}")
    return summary


def main() -> int:
    corpus = sys.argv[1]
    items = json.load(open(os.path.join(corpus, "truth.json"), encoding="utf-8"))
    for it in items:
        it["file"] = os.path.join(corpus, it["file"])
    only_variant = os.environ.get("BENCH_VARIANT")
    only_voices = os.environ.get("BENCH_VOICES")
    if only_variant:
        items = [it for it in items if it["variant"] == only_variant]
    if only_voices:
        items = [it for it in items if it["voice"] in only_voices.split(",")]
    out_file = os.path.join(corpus, "..", os.environ.get("BENCH_OUT", "results.json"))
    out = {}
    for engine in sys.argv[2:]:
        kind, _, rest = engine.partition(":")
        model_name, _, opt = rest.partition(":")
        t_load = time.time()
        model = load_fw(model_name)
        print(f"[{engine}] modelo carregado em {time.time() - t_load:.0f}s", flush=True)
        if kind == "fw":
            fn = lambda p: run_fw(model, p, opt == "vad")  # noqa: E731
        elif kind == "wx":
            state: dict = {}
            fn = lambda p: run_wx(model, p, state)  # noqa: E731
        else:
            print("motor desconhecido:", engine)
            return 2
        res, by_voice, elapsed, audio = evaluate(items, fn)
        out[engine] = report(engine, res, by_voice, elapsed, audio)
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
