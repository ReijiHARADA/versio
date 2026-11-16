#!/bin/zsh
S=${0:A:h}; cd $S; M=$S/models; mkdir -p $M
A=/Users/harada/Desktop/MyProjects/projects/versio/app/test-data/extraction-audit/baseline-fieldgold/docs
DOCS=($A/epmc-PMC13476272.json $A/epmc-PMC13592641.json)
dl() { until [ "$(stat -f%z $M/$2 2>/dev/null)" = "$3" ]; do curl -sfL -C - --retry 5 --retry-all-errors -o $M/$2 "https://huggingface.co/$1/resolve/main/$2"; sleep 2; done; }
for doc in $DOCS; do python3 paperbench.py --doc $doc --name madlad-3b --kind madlad; done
for spec in "plamo3-2b pfnet/plamo-3-translate-2b-GGUF plamo-3-translate-2b-Q4_K_M.gguf" "plamo3-8b pfnet/plamo-3-translate-8b-GGUF plamo-3-translate-8b-Q4_K_M.gguf"; do
  set -- ${=spec}
  size=$(curl -sI -L "https://huggingface.co/$2/resolve/main/$3" | grep -i '^content-length' | tail -1 | tr -dc 0-9)
  dl $2 $3 $size
  llama-server -m $M/$3 -c 65536 -np 8 --port 8090 --jinja --no-prefill-assistant -ngl 99 > log-paper-server-$1.txt 2>&1 &
  sp=$!
  for i in {1..120}; do curl -s localhost:8090/health | grep -q '"ok"' && break; sleep 2; done
  for doc in $DOCS; do python3 paperbench.py --doc $doc --name $1 --kind plamo; done
  echo "$1 peak_rss_mb $(( $(ps -o rss= -p $sp) / 1024 ))"
  kill $sp; wait $sp 2>/dev/null
done
echo PAPERDONE
