#!/usr/bin/env bash
set -euo pipefail
grobid_root="${GROBID_ROOT:-$HOME/.cache/versio-grobid/grobid-0.9.1}"
java_home="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
out="$(dirname "$0")/build"
mkdir -p "$out"
classpath="$grobid_root/grobid-core/build/classes/java/main:$grobid_root/grobid-core/build/classes/kotlin/main"
while IFS= read -r -d '' jar; do classpath+=":$jar"; done < <(find "$HOME/.gradle/caches/modules-2/files-2.1" "$grobid_root/grobid-core/localLibs" -name '*.jar' -print0)
"$java_home/bin/javac" -encoding UTF-8 -cp "$classpath" -d "$out" "$(dirname "$0")/CitationParity.java"
"$java_home/bin/java" -Dorg.grobid.home="$grobid_root/grobid-home" -Djava.library.path="$grobid_root/grobid-home/lib/mac_arm-64" -cp "$out:$classpath" grobidparity.CitationParity "$grobid_root/grobid-home"
