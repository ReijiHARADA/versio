"""Audit-only comparison harness for chat-template causal translation models."""
from __future__ import annotations
import argparse, json, time
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument('--model',required=True); ap.add_argument('--input',required=True)
    ap.add_argument('--output',required=True); ap.add_argument('--limit',type=int,default=0)
    ap.add_argument('--max-new-tokens',type=int,default=512)
    a=ap.parse_args(); rows=json.loads(Path(a.input).read_text())['rows']
    if a.limit: rows=rows[:a.limit]
    tok=AutoTokenizer.from_pretrained(a.model); model=AutoModelForCausalLM.from_pretrained(a.model)
    device='mps' if torch.backends.mps.is_available() else 'cpu'; model.to(device); model.eval()
    out=[]
    for i,row in enumerate(rows,1):
        prompt=f"Translate the following English text into Japanese.\n\n{row['source']}"
        messages=[{'role':'user','content':prompt}]
        encoded=tok.apply_chat_template(messages,add_generation_prompt=True,return_tensors='pt',return_dict=True).to(device)
        ids=encoded['input_ids']
        started=time.time()
        with torch.inference_mode(): generated=model.generate(ids,max_new_tokens=a.max_new_tokens,do_sample=False,num_beams=1)
        new=generated[0,ids.shape[1]:]
        text=tok.decode(new,skip_special_tokens=True).strip()
        out.append({**row,'model':a.model,'translation':text,'inputTokens':int(ids.shape[1]),'outputTokens':int(new.shape[0]),'timeMs':(time.time()-started)*1000})
        Path(a.output).write_text(json.dumps({'model':a.model,'count':len(out),'results':out},ensure_ascii=False,indent=2)+'\n')
        print(f'[{i}/{len(rows)}] {row.get("paperId")} {len(text)} chars',flush=True)
    print(f'wrote {a.output}')
if __name__=='__main__': main()
