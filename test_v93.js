const fs=require('fs');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const js=fs.readFileSync(__dirname+'/app.js','utf8');
const css=fs.readFileSync(__dirname+'/style.css','utf8');
function ok(v,m){if(!v) throw new Error(m)}
ok(html.includes('id="recordingDateFilter"') && html.includes('type="date"'),'real date input missing');
ok(js.includes('selectedRecordingDate'),'date filter state missing');
ok(js.includes('localDateKey'),'local date matching helper missing');
ok(js.includes('selectedRecordingDate') && js.includes('r.created_at'),'recordings are not filtered by date');
ok(css.includes('.doctor-select-wrap'),'themed doctor select wrapper missing');
ok(css.includes('.date-picker-wrap'),'themed calendar control missing');
ok(css.includes('color-scheme:dark'),'dark native controls not themed');
console.log('v93 filter tests passed');
