/* How long a record may be, and the checks made before anything is fetched or decoded.
   Shared by the main process and the tests (plain Node, no Electron). */
'use strict';
const MAX_SEC=90*60;            // longer than an hour and a half: too long for a record
const TOO_LONG='That one is longer than an hour and a half: too long for a record, sorry.';
const LIST_TOO_LONG='Everything in that list is longer than an hour and a half: too long for records, sorry.';
// "Duration: 02:55:43.21" from ffmpeg -i (0 when it isn't known, e.g. "Duration: N/A")
function parseDuration(text){const m=/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(String(text||''));return m?(+m[1])*3600+(+m[2])*60+(+m[3]):0;}
const tooLong=d=>Number(d)>MAX_SEC;
// A list's entries: the playable ones, and how many were left out for being too long.
function splitList(entries){const keep=[],long=[];for(const x of entries||[])(tooLong(x.duration)?long:keep).push(x);return {keep,skipped:long.length};}
module.exports={MAX_SEC,TOO_LONG,LIST_TOO_LONG,parseDuration,tooLong,splitList};
