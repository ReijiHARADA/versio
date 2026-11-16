#!/bin/zsh
# Sequential: MADLAD baseline (app server), then each GGUF: download -> serve -> run -> stop -> delete.
S=${0:A:h}; cd $S; M=$S/models; mkdir -p $M
TOK=$(ps eww -p $(pgrep -f "Versio.app/Contents/Resources/translation-server" | head -1) | tr ' ' '\n' | sed -n 's/^MADLAD_SERVER_TOKEN=//p')
[ -f out-madlad-3b.json ] || python3 run.py --name madlad-3b --kind madlad --token "$TOK" --pid $(pgrep -f "Versio.app/Contents/Resources/translation-server" | head -1) > log-madlad.txt 2>&1
run() { name=$1; repo=$2; file=$3; prompt=$4
  [ -f out-$name.json ] && return
  [ -s $M/$file ] || curl -sL -o $M/$file "https://huggingface.co/$repo/resolve/main/$file" || return
  llama-server -m $M/$file -c 8192 --port 8090 --jinja --no-prefill-assistant -ngl 99 > log-server-$name.txt 2>&1 &
  sp=$!
  for i in {1..120}; do curl -s localhost:8090/health | grep -q '"ok"' && break; sleep 2; done
  python3 run.py --name $name --kind llama --prompt $prompt --pid $sp > log-$name.txt 2>&1
  kill $sp; wait $sp 2>/dev/null; rm -f $M/$file
}
#run plamo3-2b pfnet/plamo-3-translate-2b-GGUF plamo-3-translate-2b-Q4_K_M.gguf plamo
#run plamo3-8b pfnet/plamo-3-translate-8b-GGUF plamo-3-translate-8b-Q4_K_M.gguf plamo
run tgemma-4b mradermacher/translategemma-4b-it-GGUF translategemma-4b-it.Q4_K_M.gguf gemma
run tgemma-12b mradermacher/translategemma-12b-it-GGUF translategemma-12b-it.Q4_K_M.gguf gemma
#run cat-7b mradermacher/CAT-Translate-7b-GGUF CAT-Translate-7b.Q4_K_M.gguf cat
#run hunyuan-mt-7b mradermacher/Hunyuan-MT-7B-GGUF Hunyuan-MT-7B.Q4_K_M.gguf hunyuan
echo ALLDONE
