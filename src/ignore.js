// Ignore conditions: where Torty Text stays out of the way (no abbreviation
// expansion, no suggestion tracking). Modeled on Timely Memory's ignore list:
//   { fields: ['title', 'url', 'app'], op: 'contains'|'equals'|'starts'|'ends', text: 'linkedin.com/*' }
const { execFile } = require('child_process');

// Chromium-family browsers share one AppleScript dictionary for tabs.
const CHROMIUM = new Set([
  'com.google.Chrome', 'com.google.Chrome.beta', 'com.google.Chrome.canary', 'com.brave.Browser',
  'com.microsoft.edgemac', 'company.thebrowser.Browser', 'org.chromium.Chromium',
  'com.vivaldi.Vivaldi', 'com.operasoftware.Opera',
]);
const SAFARI = new Set(['com.apple.Safari', 'com.apple.SafariTechnologyPreview']);
const SEP = '\u001f';

function osascript(script) {
  return new Promise(resolve => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, out) => resolve(err ? '' : out.trim()));
  });
}

// The frontmost app, its window title and, for browsers, the page address.
async function frontContext({ needUrl }) {
  const out = await osascript(`tell application "System Events"
    set p to first application process whose frontmost is true
    set t to ""
    try
      set t to name of front window of p
    end try
    return (name of p) & "${SEP}" & (bundle identifier of p) & "${SEP}" & t
  end tell`);
  const [app = '', bundleId = '', title = ''] = out.split(SEP);
  let url = '';
  if (needUrl && CHROMIUM.has(bundleId)) {
    url = await osascript(`tell application id "${bundleId}" to get URL of active tab of front window`);
  } else if (needUrl && SAFARI.has(bundleId)) {
    url = await osascript(`tell application id "${bundleId}" to get URL of front document`);
  }
  return { app, title, url };
}

// "*" is a wildcard; everything else matches literally, ignoring case.
function ruleRegex({ op, text }) {
  const body = text.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  const pattern = op === 'equals' ? `^${body}$` : op === 'starts' ? `^${body}` : op === 'ends' ? `${body}$` : body;
  return new RegExp(pattern, 'i');
}

function matches(rules, ctx) {
  return rules.some(rule => {
    if (!rule.text) return false;
    const re = ruleRegex(rule);
    return rule.fields.some(field => ctx[field] && re.test(ctx[field]));
  });
}

// True when the current app or page matches one of the rules.
async function isIgnoredNow(rules) {
  if (!rules?.length) return false;
  const ctx = await frontContext({ needUrl: rules.some(r => r.fields.includes('url')) });
  return matches(rules, ctx);
}

module.exports = { isIgnoredNow, matches, frontContext };
