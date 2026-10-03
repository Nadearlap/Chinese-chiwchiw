// Shared Playwright launcher: uses the preinstalled Chromium in cloud sessions, else Playwright's default.
const fs = require('fs');
const {chromium, devices} = require('playwright');
const OUT = process.env.OUT || require('path').join(require('os').tmpdir(), 'matcher-tests');
fs.mkdirSync(OUT, {recursive: true});
async function launch() {
  const exe = '/opt/pw-browsers/chromium';
  return fs.existsSync(exe) ? chromium.launch({executablePath: exe}) : chromium.launch();
}
module.exports = {launch, devices, OUT};
