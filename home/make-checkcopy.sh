#!/bin/zsh
# Usage: home/make-checkcopy.sh <out folder>
# Makes th.html and sh.html: the repo's index.html with ONE script prepended that seeds the role, answers the auth
# refresh with a fake token and refuses every non GET call to Supabase. Layout and speed checks run on these copies
# because device-views.mjs and speed.mjs take a bare URL and cannot stub a sign in. The app code itself is untouched.
set -e
REPO=$(cd $(dirname $0)/.. && pwd)
OUT=${1:?usage: make-checkcopy.sh <out folder outside the repo>}
mkdir -p $OUT
for role in th sh; do
  python3 - "$REPO/index.html" "$OUT/$role.html" "$role" <<'PY'
import sys
src, dst, role = sys.argv[1:4]
s = open(src).read()
stub = """<script>
(function(){ try{ localStorage.setItem('bb_cc_role','%s'); localStorage.setItem('bb_cc_rt','test-refresh'); sessionStorage.setItem('bb_cc_role','%s'); }catch(e){}
  var F = window.fetch;
  window.fetch = function(u, o){
    var url = String(u && u.url || u), m = ((o && o.method) || (u && u.method) || 'GET').toUpperCase();
    if (/supabase\\.co\\//.test(url)) {
      if (/\\/auth\\/v1\\/token/.test(url)) return Promise.resolve(new Response(JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600}), {status:200, headers:{'Content-Type':'application/json'}}));
      if (m !== 'GET' && m !== 'HEAD') { (window.__blockedWrites = window.__blockedWrites || []).push(m + ' ' + url); return Promise.resolve(new Response('[]', {status:200, headers:{'Content-Type':'application/json'}})); }
      if (o && o.headers) { var h = new Headers(o.headers); if (h.get('apikey')) h.set('Authorization', 'Bearer ' + h.get('apikey')); o = Object.assign({}, o, {headers: h}); }
    }
    return F.call(this, u, o);
  };
})();
</script>
""" % (role, role)
i = s.find('<head>') + len('<head>')
open(dst, 'w').write(s[:i] + '\n' + stub + s[i:])
PY
done
for f in manifest.json apple-touch-icon.png; do [ -e "$REPO/$f" ] && ln -sf "$REPO/$f" "$OUT/$f"; done
ls -la $OUT | tail -4
