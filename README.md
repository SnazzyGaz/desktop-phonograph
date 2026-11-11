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
- Three buttons on the front of the cabinet play the previous record, play or pause,
  and play the next one. The card on the drawer says what's playing.
- Point at a sleeve in the crate and its name shows above it. Double-click the crate
  and all the records fan out so you can pick one.
- The little dancer on the lid moves to the music; the small brass button low on the
  front swaps her for a shiba.

## Using it

| Do this | and |
|---|---|
| Drag the cabinet | moves it anywhere, onto any screen (give it a throw and it slides) |
| Scroll | makes it bigger or smaller |
| Right-click | the menu: play/pause, next, previous, shuffle, repeat, volume, speed, always on top, quit |
| Click a button on the cabinet | previous · play/pause · next |
| Click a sleeve, then click it again | slides the record out, then plays it |
| Right-click a sleeve | *Play this record now* or *Play next* |
| Double-click the crate | fans all the records out: click one to play it, scroll for more; Esc, a click elsewhere or another double-click puts them back |
| Double-click the record | look at it closely: drag (or right-drag) to turn it, scroll to bring it closer; Esc or click to put it back |
| Space · ↑ ↓ · [ ] | play/pause · volume · speed |

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
