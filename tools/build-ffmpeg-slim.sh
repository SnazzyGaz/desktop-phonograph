#!/bin/sh
# Builds the slim, audio-focused, LGPL ffmpeg.exe that Desk Phonograph bundles.
# Cross-compiles for Windows x64 with mingw-w64 (Debian/Ubuntu: mingw-w64 nasm make
# pkg-config libz-mingw-w64-dev). Usage: sh tools/build-ffmpeg-slim.sh /path/to/ffmpeg-X.Y.Z
#   TARGET=native sh tools/build-ffmpeg-slim.sh ...   builds the same set for Linux (for testing)
# What it must do (see app/main.js and the yt-dlp call there):
#  - read durations/tags from any song or video file (ffmpeg -i, -f ffmetadata)
#  - pull the audio out of video files and decode it to WAV (pcm_s16le), mono/resampled
#  - pull an embedded cover picture (JPEG/PNG) out and scale it to a .jpg
#  - let yt-dlp remux what it fetched (FixupM4a/FixupM3u8: -c copy -f mp4, aac_adtstoasc)
# No --enable-gpl / --enable-version3: the result is LGPL 2.1 or later.
set -e
SRC=${1:?ffmpeg source folder}
cd "$SRC"
DEC='aac,aac_fixed,aac_latm,mp1,mp1float,mp2,mp2float,mp3,mp3float,mp3adu,mp3on4,opus,vorbis,flac,alac,ac3,ac3_fixed,eac3,truehd,mlp,dca,wmav1,wmav2,wmapro,wmalossless,ape,wavpack,tta,amrnb,amrwb,speex,pcm_*,adpcm_*,mjpeg,png'
ENC='pcm_s16le,mjpeg'
DEMUX='mov,matroska,flv,avi,mpegts,mpegps,ogg,mp3,aac,flac,wav,w64,aiff,asf,xwma,ac3,eac3,ape,wv,tta,dts,dtshd,truehd,mlp,caf,au,amr,amrnb,amrwb,loas,ffmetadata,hls,concat,image2,image_jpeg_pipe,image_png_pipe,mjpeg,webm_dash_manifest,mpc,mpc8,voc'
MUX='wav,ffmetadata,image2,mjpeg,mp4,ipod,mov,matroska,webm,ogg,opus,mpegts,adts,mp3,flac,null'
PARSE='aac,aac_latm,ac3,flac,mpegaudio,opus,vorbis,dca,mlp,h264,hevc,vp8,vp9,av1,mjpeg,png,mpeg4video,mpegvideo'
FILT='aresample,aformat,anull,null,scale,format,copy,atrim,trim'
PROTO='file,pipe,http,https,tcp,tls,crypto,hls,data'
if [ "$TARGET" = native ]; then
  X="--disable-network"   # local test build: files only (no TLS library needed)
else
  X="--target-os=mingw32 --arch=x86_64 --cross-prefix=x86_64-w64-mingw32- --enable-schannel --extra-ldflags=-static"
fi
./configure --prefix=/opt/ffslim $X \
  --disable-autodetect --enable-zlib --disable-debug --disable-doc --disable-ffplay --disable-ffprobe \
  --disable-avdevice --disable-everything --enable-swresample --enable-swscale --enable-avfilter \
  --enable-decoder="$DEC" --enable-encoder="$ENC" --enable-demuxer="$DEMUX" --enable-muxer="$MUX" \
  --enable-parser="$PARSE" --enable-bsfs --enable-filter="$FILT" --enable-protocol="$PROTO"
if [ "$TARGET" = native ]; then make -j"$(nproc)" ffmpeg; else make -j"$(nproc)" ffmpeg.exe; fi
if [ "$TARGET" = native ]; then strip ffmpeg; else x86_64-w64-mingw32-strip ffmpeg.exe; fi
