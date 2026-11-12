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

## FFmpeg (9.0.2)
The builds bundle an unmodified `ffmpeg.exe` (in `resources\bin`) from the gyan.dev
"release essentials" build, https://www.gyan.dev/ffmpeg/builds/. FFmpeg is a trademark
of Fabrice Bellard, originator of the FFmpeg project.

That build is configured with `--enable-gpl --enable-version3`, so the binary as a whole
is licensed under the **GNU General Public License version 3**. The full licence text
ships beside it as `FFMPEG-LICENSE.txt`, and the exact version as `FFMPEG-VERSION.txt`.
Desk Phonograph runs it as a separate program and does not link to it; the MIT licence
of Desk Phonograph's own code is unaffected.

**Corresponding source.** Under GPLv3 you are entitled to the source of the FFmpeg
binary we distribute:

- FFmpeg 9.0.2 source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz. A copy of that
  exact tarball is also attached to every GitHub release of Desk Phonograph that
  contains this binary, so it stays available from the same place as the binary.
- The build's configuration and the external libraries it was built with (x264, x265,
  libvpx, libaom, LAME, Opus, Vorbis and others, each under its own free licence), with
  their versions and source links, are listed by the builder at
  https://www.gyan.dev/ffmpeg/builds/. Running `ffmpeg.exe -version` prints the full
  configuration line.

If any of those links stop working, open an issue on this repository and we will
provide the corresponding source for at least three years from the date of the release
you downloaded.

## Fonts
Jost and Manrope, SIL Open Font License 1.1 (`app/renderer/static/fonts/*-OFL.txt`).

## Vinyl Sim
The 3D phonograph, the record and groove rendering, and the player mechanics come from
Vinyl Sim by Garyck Arntzen (same author, same MIT licence).
