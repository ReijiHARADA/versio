"""Targeted diagnostic for placeholder-drop rescue on real segmented units."""
from __future__ import annotations
import json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; REPO=ROOT.parent
sys.path.insert(0,str(ROOT))
from engines.madlad_mps import MADLADEngine  # noqa: E402
from engines.citation_protect import protect_citations  # noqa: E402

SOURCE_REPORT=REPO/'test-data/real-papers/reports/protection-ab-segmented-v1.json'
OUT=REPO/'test-data/real-papers/reports/protection-rescue-diagnostic-v1.json'

def main():
    data=json.loads(SOURCE_REPORT.read_text(encoding='utf-8'))
    targets=[]
    for row in data['records']:
        current=next(x for x in row['conditions'] if x['condition']=='current')
        if current.get('error'):
            targets.append({'key':row['key'],'source':row['source']})
    engine=MADLADEngine(); engine.load_model(); records=[]
    for row in targets:
        source=row['source']; protected, spans, nonce=protect_citations(source)
        conditions=[]
        for name,unprotected,raw in [('current',set(),False),('unprotected_retry',set(spans),False),('raw',set(),True)]:
            old=os.environ.get('MADLAD_DISABLE_PROTECTION')
            if raw: os.environ['MADLAD_DISABLE_PROTECTION']='1'
            else: os.environ.pop('MADLAD_DISABLE_PROTECTION',None)
            try:
                out,ins,outs=engine._translate_chunk(source,'ja',source,unprotected_values=unprotected)
                conditions.append({'condition':name,'output':out,'inputTokens':ins,'outputTokens':outs,'error':None,'protectedSpans':spans if name!='raw' else []})
            except Exception as exc:
                conditions.append({'condition':name,'output':None,'inputTokens':None,'outputTokens':None,'error':f'{type(exc).__name__}: {exc}','protectedSpans':spans if name!='raw' else []})
            if old is None: os.environ.pop('MADLAD_DISABLE_PROTECTION',None)
            else: os.environ['MADLAD_DISABLE_PROTECTION']=old
        if spans:
            # Atomic marker diagnostic: keep the complete first span together
            # and restore it exactly after decoding. This is not production.
            marker='ZZREF1ZZ'; atomic_source=source.replace(spans[0],marker,1)
            os.environ['MADLAD_DISABLE_PROTECTION']='1'
            try:
                out,ins,outs=engine._translate_chunk(atomic_source,'ja',atomic_source)
                out=out.replace(marker,spans[0]).replace('ＺＺＲＥＦ１ＺＺ',spans[0])
                conditions.append({'condition':'atomic_first_span','output':out,'inputTokens':ins,'outputTokens':outs,'error':None,'protectedSpans':[spans[0]]})
            except Exception as exc:
                conditions.append({'condition':'atomic_first_span','output':None,'inputTokens':None,'outputTokens':None,'error':f'{type(exc).__name__}: {exc}','protectedSpans':[spans[0]]})
            os.environ.pop('MADLAD_DISABLE_PROTECTION',None)
        records.append({**row,'protectedSpans':spans,'conditions':conditions})
    OUT.write_text(json.dumps({'version':'protection-rescue-v1','sourceReport':str(SOURCE_REPORT),'modelVersion':engine.model_version,'records':records},ensure_ascii=False,indent=2)+'\n')
    print(OUT)
if __name__=='__main__': main()
