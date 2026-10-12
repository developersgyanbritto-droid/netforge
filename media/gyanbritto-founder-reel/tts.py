import sys, sherpa_onnx, soundfile as sf
which, text, out = sys.argv[1], sys.argv[2], sys.argv[3]
sid = int(sys.argv[4]) if len(sys.argv) > 4 else 0
if which == 'coqui':
    m = sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(model='vits-coqui-bn-custom_female/model.onnx', tokens='vits-coqui-bn-custom_female/tokens.txt'))
else:
    d='vits-mimic3-bn-multi_low'
    m = sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{d}/bn-multi_low.onnx', tokens=f'{d}/tokens.txt', data_dir=f'{d}/espeak-ng-data'))
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=m))
a = tts.generate(text, sid=sid, speed=1.0)
sf.write(out, a.samples, a.sample_rate); print(tts.num_speakers, a.sample_rate, len(a.samples)/a.sample_rate)
