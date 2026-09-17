#!/usr/bin/env bash
# deploy-gallery.sh — 把 gallery/ 靜態站推到自架主機（Caddy file_server 的 webroot）
#
# 打包方式與 .github/workflows/deploy-pages.yml 一致：排除三支維護腳本、給 css/js 打
# ?v=<hash>、確認 library.json 引用的樣片都在，另寫 VERSION = 部署當下的 commit SHA。
#
# 主機位址不進 repo（fork 是公開的），讀 gitignore 掉的 gallery/.deploy.env：
#   DEPLOY_SSH="root@<主機 IP>"
#   DEPLOY_KEY="$HOME/.ssh/<金鑰>"
#   DEPLOY_PATH="/var/www/<站名>"
#   DEPLOY_URL="https://<網域>"            # 選填：部署後打一次確認對外狀態
#
# 用法（從 repo 根目錄）：
#   bash assets/scripts/deploy-gallery.sh            # 部署前三關檢查不過就中止
#   bash assets/scripts/deploy-gallery.sh --force    # 跳過檢查，VERSION 標記 -dirty
#
# 前提：gallery/media/ 有全部樣片。上游的用 gallery/fetch-media.sh 拉；fork 自己新增的卡，
# 樣片只在本機（或自己的 release），換電腦時要先補回來，否則檢查會列出缺哪些。
set -euo pipefail

cd "$(dirname "$0")/../.."
CONF=gallery/.deploy.env
[ -f "$CONF" ] || { echo "❌ 缺 ${CONF}（格式見本檔檔頭）"; exit 1; }
# shellcheck disable=SC1090
source "$CONF"
: "${DEPLOY_SSH:?}" "${DEPLOY_KEY:?}" "${DEPLOY_PATH:?}"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1
SSH=(ssh -i "${DEPLOY_KEY}" -o BatchMode=yes "${DEPLOY_SSH}")

# ---- 部署前三關：線上位元必須對應得到一個已推送的 commit ----
sha=$(git rev-parse HEAD)
problems=()
git fetch -q origin
[ -z "$(git status --porcelain -- gallery)" ] || problems+=("gallery/ 有未 commit 的變更")
behind=$(git rev-list --count HEAD..origin/main)
[ "${behind}" -eq 0 ] || problems+=("落後 origin/main ${behind} 個 commit（先 merge，不要 rebase）")
git branch -r --contains HEAD | grep -q "origin/" || problems+=("HEAD 還沒推到 origin")
if [ ${#problems[@]} -gt 0 ]; then
  printf '⚠️  %s\n' "${problems[@]}"
  if [ "${FORCE}" -eq 0 ]; then
    echo "❌ 部署中止（確定要推就加 --force）"
    exit 1
  fi
  sha="${sha}-dirty"
  echo "⚠️  --force：照推，VERSION 標記為 ${sha}"
fi

# ---- 打包 ----
SITE=$(mktemp -d)
trap 'rm -rf "${SITE}"' EXIT
rsync -a --exclude sync-from-cards.py --exclude build-seo.py --exclude fetch-media.sh \
  --exclude __pycache__ --exclude .DS_Store --exclude .deploy.env gallery/ "${SITE}/"
[ -f "${SITE}/api/showcase.json" ] || printf '{"items": []}\n' > "${SITE}/api/showcase.json"
printf '%s\n' "${sha}" > "${SITE}/VERSION"

# 團隊站首頁直接是鏡頭庫：原 landing 頁不上線，/ 與 /library.html 內容相同
cp "${SITE}/library.html" "${SITE}/index.html"

# 模板區（gallery/templates/，gitignore）：有清單就確認每支影片與封面都在
if [ -f "${SITE}/templates/templates.json" ]; then
  python3 - "${SITE}" <<'PY'
import json, pathlib, sys
site = pathlib.Path(sys.argv[1])
items = json.loads((site / 'templates' / 'templates.json').read_text(encoding='utf-8'))['templates']
missing = [p for item in items for p in (item.get('video'), item.get('poster'))
           if p and not (site / p.lstrip('./')).exists()]
if missing:
    print('❌ 模板區缺檔：', *missing, sep='\n  ')
    sys.exit(1)
print(f'🎬 模板區：{len(items)} 支成片範例')
PY
else
  echo "ℹ️  沒有 gallery/templates/templates.json，模板區不顯示"
fi

# 中文版轉台灣繁體：repo 內維持簡體（跟上游與 sync-from-cards.py 相容），只轉部署包。
# 必須在打 ?v=hash 之前做，hash 才會對應轉換後的內容。
command -v opencc >/dev/null || { echo "❌ 缺 opencc（brew install opencc）"; exit 1; }
python3 - "${SITE}" <<'PY'
import pathlib, subprocess, sys
site = pathlib.Path(sys.argv[1])
# s2twp 的詞彙轉換之外，再修幾個台灣介面不慣用的結果
FIXES = [('迴圈', '循環'), ('示例', '範例'), ('臺', '台'), ('當前', '目前'), ('文本', '文字'),
         ('全屏', '全螢幕'), ('自定義', '自訂'), ('暫未匹配到', '暫未找到'), ('匹配', '符合'),
         ('主頁', '首頁'), ('檢測到', '偵測到'), ('關注與支援', '關注與支持'),
         ('zh-CN', 'zh-TW'), ('PingFang SC', 'PingFang TC'), ('Microsoft YaHei', 'Microsoft JhengHei')]
targets = [*site.glob('*.html'), *site.glob('*.js'), site / 'styles.css', site / 'api' / 'library.json']
for path in targets:
    if not path.exists():
        continue
    src = path.read_text(encoding='utf-8')
    out = subprocess.run(['opencc', '-c', 's2twp'], input=src, capture_output=True,
                         text=True, check=True).stdout
    for a, b in FIXES:
        out = out.replace(a, b)
    if src.endswith('\n') and not out.endswith('\n'):
        out += '\n'
    if out != src:
        path.write_text(out, encoding='utf-8')
print('🈶 中文版已轉台灣繁體')
PY

python3 - "${SITE}" <<'PY'
import hashlib, json, os, pathlib, re, sys
site = pathlib.Path(sys.argv[1])
assets = {n: hashlib.md5((site / n).read_bytes()).hexdigest()[:8]
          for n in ('styles.css', 'app.js', 'showcase.js', 'translations.js') if (site / n).exists()}
pattern = re.compile(r'(?P<attr>href|src)="\./(?P<name>' + '|'.join(map(re.escape, assets)) + r')(?:\?v=[^"]*)?"')
for html in sorted(site.glob('*.html')):
    text = html.read_text(encoding='utf-8')
    stamped, hits = pattern.subn(lambda m: f'{m["attr"]}="./{m["name"]}?v={assets[m["name"]]}"', text)
    if hits:
        html.write_text(stamped, encoding='utf-8')
lib = json.loads((site / 'api' / 'library.json').read_text(encoding='utf-8'))
missing = sorted({url.split('?')[0].lstrip('./')
                  for card in lib['cards'] for style in card['styles']
                  if (url := (style.get('media') or {}).get('url'))
                  and not (site / url.split('?')[0].lstrip('./')).exists()})
if missing:
    print('❌ 缺樣片（先跑 gallery/fetch-media.sh，或補回 fork 自己的樣片）：', *missing, sep='\n  ')
    sys.exit(1)
print(f"📦 打包完成：{len(lib['cards'])} 張卡，樣片齊全")
PY

# ---- 上傳 ----
# macOS 內建 openrsync 不支援 --chmod：傳完在主機端統一權限
rsync -az --delete -e "ssh -i ${DEPLOY_KEY} -o BatchMode=yes" "${SITE}/" "${DEPLOY_SSH}:${DEPLOY_PATH}/"
"${SSH[@]}" "cd '${DEPLOY_PATH}' && chown -R root:root . && find . -type d -exec chmod 755 {} + && find . -type f -exec chmod 644 {} +"

# ---- 驗收：比對線上 VERSION，不看 HTTP 200 ----
live=$("${SSH[@]}" "cat '${DEPLOY_PATH}/VERSION'")
if [ "${live}" != "${sha}" ]; then
  echo "❌ 線上 VERSION（${live}）與本次（${sha}）不符"
  exit 1
fi
echo "✅ 已部署 ${sha} → ${DEPLOY_SSH}:${DEPLOY_PATH}"
if [ -n "${DEPLOY_URL:-}" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${DEPLOY_URL}/")
  echo "🌐 ${DEPLOY_URL} → HTTP ${code}（有 Cloudflare Access 時未登入應為 302）"
fi
