const fs=require('fs');
const js=fs.readFileSync(__dirname+'/app.js','utf8');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
function assert(c,m){if(!c)throw new Error(m)}
const fn=js.slice(js.indexOf('async function loadDashboard'), js.indexOf('function waveSeed'));
const awaitPos=fn.indexOf("await api('history'");
assert(awaitPos>=0,'history fetch missing');
const after=fn.slice(awaitPos);
assert(after.includes('isRecordingPlaybackActive()'),'dashboard must re-check playback AFTER async history fetch before rendering');
assert(js.includes('let activePlaybackCount=0'),'explicit playback lock missing');
assert(html.includes('duraklat.png'),'uploaded pause icon is not used in Duraklat control');
console.log('v92 regression checks passed');
