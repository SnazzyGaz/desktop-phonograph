# Desk Phonograph

A little wind-up phonograph that lives on your Windows desktop. It sits on top of your
other windows with no frame and no background, just the machine, its crate of records
and a little dancer on the lid. Drop a song on it, or paste a web link to any audio or
video, and it plays as a record.

It's a desktop pet first and a music player second: you can drag it about, throw it
across your screens, scratch the record, and lift the needle to stop.

> **Download:** grab `Desk-Phonograph-<version>-portable.exe` from the
> [latest release](https://github.com/SnazzyGaz/desktop-phonograph/releases/latest).
> It's a single program; there's nothing to install.

## What it does

- **Play songs from your computer.** Drag MP3, WAV, FLAC, OGG, Opus, M4A/AAC, WMA (or
  the sound from a WebM/MP4) onto the phonograph, or right-click → *Play a song from this
  computer…*. Each song becomes its own record in its own sleeve, with the cover art
  from the file.
- **Play a web link.** Copy a link to some audio or video, then right-click → *Play a web
  link*, press Ctrl+V on the phonograph, or drop the link on it. A playlist or album
  arrives one sleeve at a time and plays in turn. Links to plain audio files work too.
- **Keep a record.** Web records are temporary (the newest ten are kept). If you like
  one, right-click → *Keep this record* and it stays in the crate.
- **Real record behaviour.** Lower the arm to play, lift it to stop. Grab the record to
  scratch it backwards and forwards anywhere in the song. Switch between 33⅓, 45 and
  78 rpm, or nudge the speed up and down.
- **Grooves from the music.** Each record is sized from the song's length, and its
  grooves are drawn from the song's own sound, so loud and quiet passages and the
  run-out show on the vinyl. Double-click the record to lift it off and look closely.
- **A crate of sleeves.** Point at a sleeve and its name appears. Click a sleeve to slide
  the record half out, click again to play it. Double-click the crate to fan every
  record out and pick one.
- **Player controls.** Three keys on the cabinet (previous, play/pause, next), a brass
  volume knob, a Now Playing card on the drawer, plus shuffle, repeat and auto-play
  next in the menus.
- **Desktop-pet manners.** Empty space around it clicks straight through to whatever is
  underneath. It remembers where you left it, how big it was and your records. A tray
  icon hides it and brings it back. It works across several monitors.
- **Toys.** The hula dancer on the lid moves to the music; the small brass button low
  on the front swaps her for a shiba.

## Using it

| Do this | and |
|---|---|
| Drag the cabinet | moves it anywhere, onto any screen (give it a throw and it slides and bounces off screen edges) |
| Scroll over it | makes it bigger or smaller |
| Right-click | the menu: play/pause, next, previous, shuffle, repeat, volume, speed, keep, always on top, hide, quit |
| Click a key on the cabinet | previous · play/pause · next |
| Drag the brass knob (or scroll on it) | volume |
| Click a sleeve, then click it again | slides the record out, then plays it |
| Right-click a sleeve | *Play this record now*, *Play next* or *Put this record away* |
| Double-click the crate | fans all the records out: click one to play it; Esc or a click elsewhere puts them back |
| Double-click the record | look at it closely: drag to turn it, scroll to bring it closer; Esc or click to put it back |
| Space · ↑ ↓ · [ ] | play/pause · volume · speed |
| Click the tray icon | hide or show the phonograph |

## Download and run (Windows 10/11, 64-bit)

1. Download `Desk-Phonograph-<version>-portable.exe` from
   [Releases](https://github.com/SnazzyGaz/desktop-phonograph/releases).
2. Double-click it. The first start takes a few seconds while it unpacks itself.
3. The app isn't code-signed, so Windows SmartScreen may say *"Windows protected your
   PC"*. Click **More info** → **Run anyway**.

The phonograph appears near the bottom-right of your main screen. To quit, right-click
it → *Quit*, or use the tray icon.

Your records and settings live in `%APPDATA%\Desk Phonograph` (see below), so they
survive updates. Deleting that folder resets everything.

## Under the hood

Desk Phonograph is an [Electron](https://www.electronjs.org/) app with a
[three.js](https://threejs.org/) scene. The phonograph, the record, the groove rendering
and the needle/scratch mechanics come from **Vinyl Sim**, a browser vinyl simulator by
the same author; this project wraps them up as a desktop pet.

### Main process (`app/main.js`)

- **The window ("stage").** The window is transparent, frameless, always on top and
  hidden from the taskbar. Rather than being the size of the phonograph, it covers the
  work area of the screen the phonograph is on, and the page draws the pet wherever it
  is inside that. This means resizing, fanning records, inspecting and dragging around
  one screen never move or resize the OS window, so nothing jumps or flashes. Only
  crossing to another screen moves the window, using a hand-off: the page blanks, the
  window moves, and the page redraws the pet at its new spot, so you never see a ghost
  of it on the wrong screen. (A stage that would exactly cover a whole monitor is kept
  1 px smaller so Windows doesn't treat it as a full-screen app.)
- **Click-through.** The page tests the alpha of the pixels under the mouse (with a little
  padding) and tells the main process whether it's over something solid; everything
  else passes through to the windows underneath (`setIgnoreMouseEvents` with forwarding).
- **Clean start.** The window is only shown once the page reports that the pet is drawn
  in place, with fallbacks after 6 and 20 seconds so it can never stay hidden.
- **Moving.** Dragging is screen-space and driven by the page; letting go fast starts a
  fling with damping that bounces off screen edges (but not where another monitor
  continues). It keeps itself on screen and comes home to the main screen if a monitor
  goes away. If Windows quietly drops the "always on top" flag, it's put back.
- **Menus and tray** are built here. Every menu click is logged and guarded, so a failure
  shows a friendly message in the pet's speech bubble instead of an error box.
- **Library and files.** The record list, covers and settings are saved here. "Keep this
  record" moves a fetched song from the temp folder into the app's own records folder.
  Putting a record away deletes only files the app itself fetched, never your own songs.
- **Web links** are handled by a bundled copy of [yt-dlp](https://github.com/yt-dlp/yt-dlp),
  run hidden. It first asks what's behind the link (one track, or a list) without
  fetching anything, then fetches the audio into a temp folder with progress shown on
  the record. A writable copy of yt-dlp in the app's data folder updates itself quietly
  at most once a day; if that ever breaks, the bundled copy is used.
- **[FFmpeg](https://ffmpeg.org/)** (bundled) reads durations and tags, pulls cover art out
  of formats the page can't read, and turns anything Chromium can't decode into plain WAV.

### Page (`app/renderer/`)

- `pet-shell.js`: hit-testing, window dragging, drag-and-drop, paste and keyboard.
- `pet-player.js`: the player and library. Needle, scratch, seek and speed mechanics are
  carried over from the Vinyl Sim player. A song is decoded whole into memory (so a
  scratch can reach anywhere in it), played through Web Audio with a reversed copy for
  backwards scratching, and placed in 3D at the horn's mouth.
- `static/view.js`: the three.js scene: cabinet, horn, arm, crate, sleeves, front keys,
  knob, Now Playing card, fan and inspect views, and the hula girl and shiba.
- `static/vinyl-core.js`: a JavaScript port of Vinyl Sim's cutter maths. It sizes each
  record from the song's length and works out the groove spiral.
- `static/groove-surface-worker.js`: a Web Worker that builds the record's groove
  surface texture from the song's own sound (an imitation of a real cut groove, rebuilt
  from the playback audio), which the vinyl shader reads so loud and quiet passages and
  the run-out catch the light.
- `play-order.js`: shuffle, repeat and what plays next.

### Covers for web links (`app/cover.js`)

A link can name several pictures, and the biggest one often doesn't exist (the site
answers 404 or sends a small grey stand-in). So the app keeps an ordered list of up to 16
candidates, biggest first, plus the standard sizes some video sites keep for every
video, and uses the first one that's genuinely a picture: it checks the image bytes
themselves (JPEG/PNG/GIF/WebP/AVIF headers), skips grey placeholders, and caps the size.
Records saved before covers existed get theirs filled in afterwards.

### Safety rails for long records

- **90-minute limit** (`app/limits.js`). Anything over an hour and a half is turned away
  *before* it's fetched or read: from the link's reported length, from a file's header,
  and from yt-dlp's own duration filter. In a playlist, only the too-long entries are
  skipped. Decoding is also capped at 90 minutes and files over 1.5 GB are refused.
- **Light decoding for long songs.** Songs over 20 minutes, of unknown length, or bigger
  than 250 MB are decoded by FFmpeg as mono at 32 kHz, so a long mix doesn't fill the
  computer's memory.
- **Crash guard.** The page tells the main process which record it's putting on. If the
  page crashes during that, the record is marked bad and won't be put on again by
  itself; two crashes within a minute and the app restarts with nothing playing.
- **Housekeeping.** Only the newest ten temporary web records are kept; old decode
  leftovers in the temp folder are cleared after six hours; the log trims itself.

### Where your data lives

| What | Where |
|---|---|
| Settings (position, size, volume, shuffle, repeat…) | `%APPDATA%\Desk Phonograph\settings.json` |
| Your records (titles, links, file paths) | `%APPDATA%\Desk Phonograph\library.json` |
| Cover pictures | `%APPDATA%\Desk Phonograph\covers\` |
| Kept web records | `%APPDATA%\Desk Phonograph\records\` |
| Self-updating yt-dlp copy | `%APPDATA%\Desk Phonograph\bin\` |
| Log | `%APPDATA%\Desk Phonograph\log.txt` |
| Temporary web records and decode scratch | `%TEMP%\DeskPhonograph\` |

Nothing is sent anywhere except the requests needed to play the links you give it
(and yt-dlp's daily update check).

## Building from source

You need [Node.js](https://nodejs.org/) 20 or later. Building for Windows is easiest on
Windows.

```
git clone https://github.com/SnazzyGaz/desktop-phonograph.git
cd desktop-phonograph
npm install
npm run fetch-tools      # downloads yt-dlp.exe and ffmpeg.exe into vendor-bin/ and checks their checksums
npm start                # run from source
```

Builds land in `dist/`:

```
npm run build:portable   # dist/Desk-Phonograph-<version>-portable.exe (single file)
npm run build:win        # dist/win-unpacked/ (an unpacked app folder, run "Desk Phonograph.exe")
```

The two helper programs aren't kept in git; `fetch-tools` gets the latest yt-dlp
release and the gyan.dev FFmpeg "release essentials" build and verifies both against
their publishers' published SHA-256 checksums.

Tests: `npm test` runs the quick unit checks (plain Node). The other scripts in `test/`
drive the real app with `playwright-core` (and most need Linux + xvfb); see the comment
at the top of each.

## Licence and credits

Made by **Garyck Arntzen** · [@_mintydoge](https://x.com/_mintydoge) on X.

Desk Phonograph is released under the [MIT licence](LICENSE). The release builds bundle
Electron, three.js, yt-dlp, FFmpeg and two open fonts, each under its own licence;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). FFmpeg in the builds is GPLv3;
its source is linked there and attached to each release.

Please only play things you have the right to play.
