# Third-party notices

Desk Phonograph is MIT-licensed (see `LICENSE`). It is built on, and the Windows
installer ships, the following software under their own licences.

## three.js (r169)
MIT License, Copyright © 2010-2024 three.js authors. Full text:
`app/renderer/static/vendor/three/LICENSE.txt`. https://threejs.org/

## Electron
MIT License, Copyright © Electron contributors, Copyright © 2013-2020 GitHub Inc.
https://github.com/electron/electron. Electron includes Chromium and other
components; their licences are shipped with the app as `LICENSES.chromium.html`
next to the program.

## yt-dlp
The Unlicense (public domain). https://github.com/yt-dlp/yt-dlp
The installer bundles the official Windows release `yt-dlp.exe`, which keeps itself
up to date in the app's own data folder.

## FFmpeg
The installer bundles `ffmpeg.exe` from the gyan.dev "release essentials" build
(https://www.gyan.dev/ffmpeg/builds/). That build is configured with GPL components
and is licensed under the **GNU General Public License version 3** (full text shipped
as `FFMPEG-LICENSE.txt` beside it). FFmpeg is a trademark of Fabrice Bellard.
FFmpeg source code: https://ffmpeg.org/download.html; the exact release used is
named in `FFMPEG-VERSION.txt` (source tarballs at https://ffmpeg.org/releases/).
Desk Phonograph runs it as a separate program and does not link to it.

## Fonts
Jost and Manrope, SIL Open Font License 1.1 (`app/renderer/static/fonts/*-OFL.txt`).

## Vinyl Sim
The 3D phonograph, the record and groove rendering, the needle close-up and the
player mechanics come from Vinyl Sim by Garyck Arntzen.
