# Mock playback fixtures

These files let the development mock Plex server exercise the Nocturne player without a real Plex
installation.

- `sample.mp4` — a short CC0 test clip from MDN's
  [cc0-videos](https://github.com/mdn/interactive-examples/tree/main/live-examples/media/cc0-videos)
  collection. Source: <https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4>
- `hls/` — the same clip transcoded to a single MPEG-TS HLS segment with ffmpeg, used to test the
  HLS proxy and player.

These fixtures are only loaded when you run `npm run mock:plex`. They are not part of the normal
Nocturne application and are never served from the real Plex connection.
