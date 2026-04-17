#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$HOME/work/spring-sources}"
SPRING_BOOT_TAG="${SPRING_BOOT_TAG:-v3.4.4}"

mkdir -p "$TARGET_DIR"

if [[ ! -d "$TARGET_DIR/spring-boot/.git" ]]; then
  git clone https://github.com/spring-projects/spring-boot.git "$TARGET_DIR/spring-boot"
fi

cd "$TARGET_DIR/spring-boot"
git fetch --tags --prune
git checkout "$SPRING_BOOT_TAG"

echo "spring-boot ready at: $TARGET_DIR/spring-boot (tag: $SPRING_BOOT_TAG)"
