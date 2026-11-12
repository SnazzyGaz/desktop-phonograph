# Third-party notices

Desk Phonograph is MIT-licensed (see `LICENSE`), Copyright (c) 2026 Garyck Arntzen.
The source in this repository includes three.js and two fonts. The Windows release
builds (the portable `.exe` and the unpacked app folder) also ship Electron, yt-dlp and
FFmpeg. Each is under its own licence, listed here.

## three.js (r169)
MIT License, Copyright © 2010-2024 three.js authors. Full text:
`app/renderer/static/vendor/three/LICENSE.txt`. https://threejs.org/ ·
https://github.com/mrdoob/three.js

## Electron (45.2.3)
MIT License, Copyright © Electron contributors, Copyright © 2013-2020 GitHub Inc.
https://github.com/electron/electron. Electron includes Chromium, Node.js and other
components under their own licences; the builds ship them next to the program as
`LICENSE.electron.txt` and `LICENSES.chromium.html`.

## yt-dlp
The Unlicense (public domain). https://github.com/yt-dlp/yt-dlp

The builds bundle the official, unmodified Windows release `yt-dlp.exe` (in
`resources\bin`), which keeps itself up to date in the app's own data folder. That
executable is built by the yt-dlp project with PyInstaller and contains Python and
other libraries under their own licences; see the yt-dlp project's
[THIRD_PARTY_LICENSE.txt](https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSE.txt).
Desk Phonograph runs it as a separate program.

## FFmpeg (9.0.2, slim LGPL build)
The builds bundle `ffmpeg.exe` (in `resources\bin`), a slim, audio-focused build of
FFmpeg made for Desk Phonograph. FFmpeg is a trademark of Fabrice Bellard, originator
of the FFmpeg project. https://ffmpeg.org/

It is configured **without** `--enable-gpl`, `--enable-version3` or `--enable-nonfree`,
so it is licensed under the **GNU Lesser General Public License version 2.1 or later**.
The full licence text ships beside it as `FFMPEG-LICENSE.txt`, and the version as
`FFMPEG-VERSION.txt`. Desk Phonograph runs it as a separate program and does not link
to it; the MIT licence of Desk Phonograph's own code is unaffected.

It contains only what the app needs: demuxers for common audio files and video
containers (MP4/M4A/MOV, WebM/MKV, FLV, AVI, MPEG-TS/PS, Ogg, ASF/WMA/WMV, MP3, AAC,
FLAC, WAV, AIFF and more), audio decoders (AAC, MP3, MP2, Opus, Vorbis, FLAC, ALAC, PCM,
AC-3/E-AC-3, DTS, TrueHD, WMA, APE, WavPack, TTA, AMR, Speex), JPEG/PNG decoding and
JPEG encoding for embedded cover pictures, WAV output, the muxers yt-dlp uses to tidy up
what it fetched (MP4/M4A, Matroska/WebM, Ogg, MPEG-TS, ADTS, MP3, FLAC), and HTTPS through
Windows' own Schannel. It has no video decoders or encoders: the audio is taken out of
a video file without decoding the picture. The only library built in is zlib (zlib
licence); it is linked statically with the mingw-w64 runtime and needs only Windows'
own DLLs.

**Corresponding source.** Under the LGPL you are entitled to the source of the FFmpeg
binary we distribute, and to rebuild it:

- FFmpeg 9.0.2 source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz. A copy of that
  exact tarball is attached to every release of Desk Phonograph that contains this
  binary, and to the
  [`ffmpeg-slim-9.0.2`](https://github.com/SnazzyGaz/desktop-phonograph/releases/tag/ffmpeg-slim-9.0.2)
  release together with the binary itself, its full configure line
  (`FFMPEG-CONFIGURE.txt`) and checksums.
- The exact build recipe is `tools/build-ffmpeg-slim.sh` in this repository
  (cross-compiled on Debian 13 with mingw-w64 GCC 14 and zlib 1.3.1). Running
  `ffmpeg.exe -version` prints the full configuration line.

If any of those links stop working, open an issue on this repository and we will
provide the corresponding source for at least three years from the date of the release
you downloaded.

Desk Phonograph 1.0.10 and earlier bundled the GPLv3 gyan.dev "essentials" build of
FFmpeg instead; its source (FFmpeg 9.0.2) is attached to the v1.0.10 release.

## Fonts
Jost and Manrope, SIL Open Font License 1.1 (`app/renderer/static/fonts/*-OFL.txt`).

## Vinyl Sim
The 3D phonograph, the record and groove rendering, and the player mechanics come from
Vinyl Sim by Garyck Arntzen (same author, same MIT licence).
