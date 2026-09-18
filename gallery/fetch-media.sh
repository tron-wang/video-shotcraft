#!/usr/bin/env bash
# Download the motion-preview MP4s from the gallery-media release into
# gallery/media/ for local preview. They are not tracked in git — the
# deploy-pages workflow fetches them the same way when publishing.
set -euo pipefail
cd "$(dirname "$0")"

# 样片 release 放在 fork（主线）。私有企业库或其他镜像可用环境变量覆盖：
#   SHOTCRAFT_MEDIA_REPO=TempoXAI/video-shotcraft gallery/fetch-media.sh
REPO="${SHOTCRAFT_MEDIA_REPO:-tron-wang/video-shotcraft}"
gh release download gallery-media \
  --repo "$REPO" \
  --dir media \
  --pattern '*.mp4' \
  --clobber
echo "done: $(ls media/*.mp4 | wc -l | tr -d ' ') clips in gallery/media/"

# Showcase 用户投稿（存 showcase-media release，同样不进 git）。
# release 还不存在（尚无投稿）时静默跳过，showcase 页显示空列表。
if gh release view showcase-media --repo "$REPO" >/dev/null 2>&1; then
  mkdir -p showcase-media
  gh release download showcase-media \
    --repo "$REPO" \
    --dir showcase-media \
    --clobber
  if [ -f showcase-media/showcase.json ]; then
    mv showcase-media/showcase.json api/showcase.json
  fi
  echo "done: $(ls showcase-media/*.mp4 2>/dev/null | wc -l | tr -d ' ') showcase clips"
elif [ -f api/showcase.json ]; then
  # 该库没有 showcase-media（例如 fork 尚未镜像投稿）：保留仓库里现有的清单，别清空
  echo "no showcase-media release on $REPO: kept existing api/showcase.json"
else
  printf '{"items": []}\n' > api/showcase.json
  echo "no showcase-media release yet: wrote empty api/showcase.json"
fi
