import { describe, expect, it } from "vitest";
import {
  buildLoudnormMeasureArgs,
  buildPreprocessArgs,
  chooseFit,
  parseLoudnormJson,
  parseProbe,
  ProbeError,
  type ProbeInfo,
} from "./preprocess";

describe("parseProbe", () => {
  it("lê duração, resolução, fps e áudio", () => {
    const p = parseProbe({
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30000/1001" },
        { codec_type: "audio" },
      ],
      format: { duration: "12.345" },
    });
    expect(p).toMatchObject({ durationMs: 12345, width: 1080, height: 1920, hasAudio: true, isHdr: false, rotation: 0 });
    expect(p.fps).toBeCloseTo(29.97, 2);
  });

  it("troca largura e altura quando o celular gravou com rotação de 90°", () => {
    const p = parseProbe({
      streams: [{ codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1", side_data_list: [{ rotation: -90 }] }, { codec_type: "audio" }],
      format: { duration: "5" },
    });
    expect(p.rotation).toBe(270);
    expect([p.width, p.height]).toEqual([1080, 1920]);
  });

  it("detecta HDR", () => {
    const p = parseProbe({
      streams: [{ codec_type: "video", width: 3840, height: 2160, avg_frame_rate: "60/1", color_transfer: "arib-std-b67" }, { codec_type: "audio" }],
      format: { duration: "5" },
    });
    expect(p.isHdr).toBe(true);
  });

  it("erros claros", () => {
    expect(() => parseProbe({ streams: [{ codec_type: "audio" }], format: { duration: "5" } })).toThrow(ProbeError);
    expect(() => parseProbe({ streams: [{ codec_type: "video", width: 10, height: 10 }], format: {} })).toThrow(/duração/);
  });
});

describe("loudnorm", () => {
  const stderr = `[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-23.50",\n\t"input_tp" : "-4.10",\n\t"input_lra" : "6.20",\n\t"input_thresh" : "-33.80",\n\t"output_i" : "-15.1",\n\t"target_offset" : "0.12"\n}\n`;
  it("extrai a medição do stderr", () => {
    expect(parseLoudnormJson(stderr)).toMatchObject({ input_i: "-23.50", target_offset: "0.12" });
  });
  it("falha com áudio mudo (-inf)", () => {
    const bad = stderr.replace('"-23.50"', '"-inf"');
    expect(() => parseLoudnormJson(bad)).toThrow(ProbeError);
    expect(() => parseLoudnormJson("nada")).toThrow(ProbeError);
  });
  it("medição usa alvo de -15 LUFS (dentro da faixa -14 a -16)", () => {
    expect(buildLoudnormMeasureArgs("in.mp4").join(" ")).toContain("loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json");
  });
});

describe("buildPreprocessArgs", () => {
  const vertical: ProbeInfo = { durationMs: 10000, width: 1080, height: 1920, fps: 30, hasAudio: true, isHdr: false, rotation: 0, videoCodec: "h264" };
  const measure = { input_i: "-23", input_tp: "-4", input_lra: "6", input_thresh: "-33", target_offset: "0.1" };
  const fc = (a: string[]) => a[a.indexOf("-filter_complex") + 1]!;

  it("vertical: cobre 1080×1920, 30 fps, e usa loudnorm linear com os valores medidos", () => {
    const a = buildPreprocessArgs({ input: "in.mp4", output: "out.mp4", probe: vertical, loudnorm: measure });
    expect(fc(a)).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(fc(a)).toContain("fps=30");
    expect(fc(a)).toContain("measured_I=-23");
    expect(fc(a)).toContain("linear=true");
    expect(fc(a)).toContain("aresample=48000");
    expect(a.join(" ")).toContain("-c:a aac");
  });

  it("horizontal: primeiro plano sobre fundo desfocado", () => {
    const a = buildPreprocessArgs({ input: "in.mp4", output: "out.mp4", probe: { ...vertical, width: 1920, height: 1080 }, loudnorm: measure });
    expect(fc(a)).toContain("boxblur");
    expect(fc(a)).toContain("overlay=(W-w)/2:(H-h)/2");
  });

  it("HDR ganha tone mapping para SDR", () => {
    const a = buildPreprocessArgs({ input: "in.mp4", output: "out.mp4", probe: { ...vertical, isHdr: true }, loudnorm: measure });
    expect(fc(a)).toContain("tonemap=tonemap=hable");
  });

  it("recusa vídeo sem áudio", () => {
    expect(() => buildPreprocessArgs({ input: "i", output: "o", probe: { ...vertical, hasAudio: false }, loudnorm: measure })).toThrow(/áudio/);
  });

  it("chooseFit respeita o modo forçado", () => {
    expect(chooseFit(1920, 1080)).toBe("blur-pad");
    expect(chooseFit(1080, 1920)).toBe("cover");
    expect(chooseFit(1080, 1920, "blur-pad")).toBe("blur-pad");
  });
});
