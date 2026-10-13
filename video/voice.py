"""The two narrator "voices" the video can use.

- DraftVoice: silence, timed from the word count. Free and offline, so we can check the
  pacing and the pictures before spending any ElevenLabs credits.
- ElevenLabsVoice: the real narrator. It reads ELEVENLABS_API_KEY from video/.env.local
  (put there by `npm run video:key`) and never prints, logs or saves the key anywhere else.

Both save their audio in video/voice-cache/, so re-rendering after a visual tweak reuses
the same audio and costs nothing.
"""
import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from manim_voiceover.helper import remove_bookmarks
from manim_voiceover.services.base import SpeechService, initialize_speech_service
from manim_voiceover.tracker import AUDIO_OFFSET_RESOLUTION
from pydub import AudioSegment

HERE = Path(__file__).resolve().parent
CACHE_DIR = HERE / "voice-cache"
SETTINGS = json.loads((HERE / "voice.json").read_text())

WORDS_PER_SECOND = 2.5  # a calm narrator; only used for the silent draft


def word_boundaries(text: str, starts: list[float]) -> list[dict]:
    """One entry per word: where it starts in the text and in the audio.

    `starts[i]` is the time (seconds) at which character i is spoken.
    """
    out = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        j = i
        while j < len(text) and not text[j].isspace():
            j += 1
        out.append({
            "audio_offset": int(starts[i] * AUDIO_OFFSET_RESOLUTION),
            "text_offset": i,
            "word_length": j - i,
            "text": text[i:j],
            "boundary_type": "Word",
        })
        i = j
    return out


class DraftVoice(SpeechService):
    def __init__(self, **kwargs):
        initialize_speech_service(self, {"cache_dir": str(CACHE_DIR), **kwargs})

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        text = remove_bookmarks(text)
        seconds = len(text.split()) / WORDS_PER_SECOND + 0.4
        input_data = {"input_text": text, "service": "draft", "seconds": round(seconds, 2)}
        cached = self.get_cached_result(input_data, self.cache_dir)
        if cached is not None:
            return cached
        audio = self.get_audio_basename(input_data) + ".wav"
        AudioSegment.silent(duration=int(seconds * 1000), frame_rate=44100).export(
            str(Path(self.cache_dir) / audio), format="wav")
        per_char = (seconds - 0.4) / max(len(text), 1)
        return {
            "input_text": text,
            "input_data": input_data,
            "original_audio": audio,
            "word_boundaries": word_boundaries(text, [k * per_char for k in range(len(text))]),
        }


def read_key() -> str:
    env = HERE / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("No ElevenLabs key yet. Run `npm run video:key` in the ProveIt folder first.")


class ElevenLabsVoice(SpeechService):
    def __init__(self, **kwargs):
        initialize_speech_service(self, {"cache_dir": str(CACHE_DIR), **kwargs})
        self.voice_id = SETTINGS["voice_id"]
        self.model_id = SETTINGS["model_id"]
        self.voice_settings = SETTINGS["voice_settings"]

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        text = remove_bookmarks(text)
        input_data = {
            "input_text": text,
            "service": "elevenlabs",
            "voice_id": self.voice_id,
            "model_id": self.model_id,
            "voice_settings": self.voice_settings,
        }
        cached = self.get_cached_result(input_data, self.cache_dir)
        if cached is not None:
            return cached

        body = json.dumps({
            "text": text,
            "model_id": self.model_id,
            "voice_settings": self.voice_settings,
        }).encode()
        request = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/with-timestamps"
            "?output_format=mp3_44100_128",
            data=body,
            method="POST",
            headers={"xi-api-key": read_key(), "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                reply = json.loads(response.read())
        except urllib.error.HTTPError as error:
            # Show ElevenLabs' explanation (it never contains the key).
            raise SystemExit(f"ElevenLabs said {error.code}: {error.read().decode()[:400]}")

        audio = self.get_audio_basename(input_data) + ".mp3"
        (Path(self.cache_dir) / audio).write_bytes(base64.b64decode(reply["audio_base64"]))

        data = {"input_text": text, "input_data": input_data, "original_audio": audio}
        alignment = reply.get("alignment") or {}
        starts = alignment.get("character_start_times_seconds") or []
        if len(starts) == len(text):
            data["word_boundaries"] = word_boundaries(text, starts)
        return data


def make_voice() -> SpeechService:
    if os.environ.get("PROVEIT_VOICE") == "elevenlabs":
        return ElevenLabsVoice()
    return DraftVoice()
