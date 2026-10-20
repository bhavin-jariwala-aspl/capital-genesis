# Neural text-to-speech for the narration (Kokoro, runs locally). Called by narrate.mjs:
#   tts.py jobs.json      jobs = {"voice": "af_heart", "items": [{"text": "…", "speed": 1.0, "out": "/tmp/x.wav"}]}
# Writes each item as 24 kHz mono 16-bit WAV. One process per batch, so the model loads once.
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.environ.get('KOKORO_DIR', os.path.join(HERE, '..', '.tts'))

jobs = json.load(open(sys.argv[1]))
kokoro = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
for item in jobs['items']:
    samples, rate = kokoro.create(item['text'], voice=jobs['voice'], speed=item.get('speed', 1.0), lang=jobs.get('lang', 'en-us'))
    sf.write(item['out'], samples, rate, subtype='PCM_16')
