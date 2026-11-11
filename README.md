# Desk Phonograph

A little wind-up phonograph that sits on your Windows desktop, on top of your other
windows. Drop a song on it, or paste a link to any audio or video and it plays as a
record.

- **Play a song from this computer**: drag an MP3, WAV, FLAC, OGG or M4A onto the
  phonograph, or right-click → *Play a song from this computer…*. Each song becomes its
  own record in its own sleeve, with the cover art from the file.
- **Play a web link**: copy a link, right-click → *Play a web link*. (Pasting with
  Ctrl+V or dropping a link on it works too.) A list of songs arrives one sleeve at a
  time and plays in turn.
- Lower the arm to play, lift it to stop. Grab the record to scratch it, backwards and
  forwards anywhere in the song.
- The grooves are drawn from the song's own sound: loud and quiet passages and the
  run-out show on the record. Double-click the record to take a close look at it.
- The little dancer on the lid moves to the music; the brass button swaps her for a
  shiba.

## Using it

| Do this | and |
|---|---|
| Drag the cabinet | moves it anywhere, onto any screen (give it a throw and it slides) |
| Scroll | makes it bigger or smaller |
| Right-click | the menu: speed, volume, needle close-up, always on top, quit |
| Double-click the record | look at it closely: drag to turn it, right-drag to look round, scroll to zoom; Esc or click to put it back |
| Space · ↑ ↓ · [ ] | needle up/down · volume · speed |

The phonograph always faces you in the same three-quarter view.

Empty space around it clicks straight through to whatever is underneath. The tray
icon hides it and brings it back. It remembers where you left it, its size and your
records. Web records are temporary (the last ten are kept) unless you right-click →
*Keep this record*.

## Building (Windows installer and portable zip)

Needs Node.js 20 or later, on Windows (or anywhere `electron-builder` can build for
Windows).

```
npm install
npm run build:win
```

`build:win` first runs `npm run fetch-tools`, which downloads `yt-dlp.exe` and
`ffmpeg.exe` into `vendor-bin/` and checks them against their publishers' checksums
(they are not kept in git). The installer and the zip land in `dist/`.

Run from source with `npm start` (after `npm run fetch-tools`). `npm test` runs the
quick checks; `npm run test:e2e -- song.mp3` drives the real app (needs
`playwright-core`).

## Credits

Made by Garyck Arntzen · [@_mintydoge](https://x.com/_mintydoge). The phonograph,
records and player come from his Vinyl Sim.

MIT licence (`LICENSE`). Third-party software and licences: `THIRD_PARTY_NOTICES.md`.
