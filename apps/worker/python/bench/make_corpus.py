#!/usr/bin/env python3
"""Gera um corpus de teste em pt-BR com o tempo REAL de cada palavra (verdade conhecida).

Como: cada palavra é sintetizada separadamente (`say` do macOS), o início/fim da fala é medido pela envoltória do
áudio e as palavras são montadas em frases com pausas variáveis. Assim sabemos, ao milissegundo, onde cada palavra
começa e termina — algo impossível de obter de gravações reais sem marcação manual.

Limites (deixar claro nos relatórios): é voz sintética e palavras isoladas; serve para COMPARAR motores entre si e
medir o erro de borda, não para prever a taxa de acerto em gravação real com ruído de ambiente.

Uso: make_corpus.py <pasta_de_saida>   (somente macOS)
"""
import json
import os
import random
import subprocess
import sys
import wave

import numpy as np

SR = 16000
# Só a Luciana: as demais vozes pt-BR do macOS (Eddy, Flo, Reed, Rocko, Shelley...) são vozes de efeito que nem o Whisper
# entende (WER 57–92% contra 2% da Luciana) e contaminariam a medição. A variedade vem da velocidade da fala.
VOICE = "Luciana"
RATES = [150, 185, 230]  # palavras por minuto (lenta, normal, rápida)
SENTENCES = [
    "Você sabia que alugar um carro por assinatura sai mais barato que financiar",
    "Quarenta por cento dos clientes voltam em menos de um mês",
    "Hoje eu vou te mostrar três erros que fazem sua empresa perder vendas",
    "Chama no WhatsApp agora e garante o desconto da semana",
    "A nossa escola ensina inglês para crianças com aulas ao vivo",
    "Grave uma vez e transforme o vídeo em dezenas de conteúdos",
    "O segredo é testar vários ganchos e ficar com o que mais prende a atenção",
    "Clique no link da bio e peça seu orçamento sem compromisso",
    "Muita gente acha que marketing digital é só postar todo dia",
    "Em dezessete anos de mercado a gente aprendeu que consistência vence criatividade",
    "Se você tem uma locadora de veículos precisa ver isso até o final",
    "Não deixe para amanhã o que pode dobrar o seu faturamento hoje",
    "A primeira coisa é entender quem é o seu cliente ideal",
    "Seguindo esse método a gente publicou cento e vinte vídeos em um mês",
    "Salve esse vídeo e compartilhe com quem precisa ouvir isso",
    "O resultado apareceu logo na segunda semana de campanha",
]


def say_word(voice: str, rate: int, word: str, out: str) -> None:
    subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", out, "--data-format=LEI16@%d" % SR, word], check=True)


def read_wav(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def write_wav(path: str, x: np.ndarray) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def trim_speech(x: np.ndarray) -> np.ndarray:
    """Remove o silêncio das pontas pela envoltória (janela de 5 ms, limiar de 4% do pico)."""
    win = SR // 200
    env = np.convolve(np.abs(x), np.ones(win) / win, mode="same")
    idx = np.where(env > 0.04 * env.max())[0]
    return x[idx[0] : idx[-1] + 1]


def main() -> int:
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    rng = random.Random(7)
    cache: dict = {}
    tmp = os.path.join(out, "_w.wav")

    def word_audio(rate: int, word: str) -> np.ndarray:
        key = (rate, word)
        if key not in cache:
            say_word(VOICE, rate, word, tmp)
            cache[key] = trim_speech(read_wav(tmp))
        return cache[key]

    items = []
    for vi, rate in enumerate(RATES):
        voice = f"{VOICE}@{rate}"
        for si, sentence in enumerate(SENTENCES):
            words = sentence.split()
            parts = [np.zeros(int(0.4 * SR), dtype=np.float32)]
            pos = len(parts[0])
            truth = []
            for wi, w in enumerate(words):
                a = word_audio(rate, w)
                truth.append({"w": w, "start_ms": round(pos * 1000 / SR, 1), "end_ms": round((pos + len(a)) * 1000 / SR, 1)})
                parts.append(a)
                pos += len(a)
                gap = int(rng.choice([0.02, 0.04, 0.08, 0.15, 0.25]) * SR)  # fala corrida (20 ms) até pausa (250 ms)
                parts.append(np.zeros(gap, dtype=np.float32))
                pos += gap
            parts.append(np.zeros(int(0.5 * SR), dtype=np.float32))
            clean = np.concatenate(parts)
            clean = clean / max(1e-6, np.abs(clean).max()) * 0.8
            name = f"luciana{rate}_{si:02d}"
            write_wav(os.path.join(out, f"{name}_limpo.wav"), clean)
            items.append({"file": f"{name}_limpo.wav", "voice": voice, "variant": "limpo", "text": sentence, "words": truth})

            # variante com ruído de ambiente (SNR ~ 12 dB), como numa gravação fora de estúdio
            noise = np.random.default_rng(si * 31 + vi).standard_normal(len(clean)).astype(np.float32)
            noise = np.convolve(noise, np.ones(8) / 8, mode="same")  # ruído mais grave, tipo ar-condicionado/rua
            sig_p = float(np.mean(clean**2))
            noise *= np.sqrt(sig_p / (10 ** (12 / 10)) / max(1e-9, float(np.mean(noise**2))))
            write_wav(os.path.join(out, f"{name}_ruido.wav"), clean + noise)
            items.append({"file": f"{name}_ruido.wav", "voice": voice, "variant": "ruido", "text": sentence, "words": truth})

    os.remove(tmp)
    with open(os.path.join(out, "truth.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(f"{len(items)} arquivos, {sum(len(i['words']) for i in items)} palavras -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
