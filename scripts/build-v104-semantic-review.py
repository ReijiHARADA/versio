import collections, hashlib, json, pathlib, re
root=pathlib.Path('test-data/real-papers/reports')
bench=root/'translation-audit-v104-quality-v9-fresh-four.json'
rows_by_id={}
for paper in json.load(open(bench))['papers']:
    for row in paper['rows']: rows_by_id[row['key']]=row

def norm(s): return re.sub(r'\s+',' ',s or '').strip()
oldkeys=set(); oldhash=set()
for path in root.glob('translation-audit-*.json'):
    if path.name.startswith('translation-audit-v104-'): continue
    try: data=json.load(open(path))
    except Exception: continue
    def walk(x):
        if isinstance(x,dict):
            if isinstance(x.get('source'),str):
                if x.get('key'): oldkeys.add(x['key'])
                oldhash.add(hashlib.sha256(norm(x['source']).encode()).hexdigest())
            for v in x.values(): walk(v)
        elif isinstance(x,list):
            for v in x: walk(v)
    walk(data)
allrows=list(rows_by_id.values()); unique=[]; seen=set(); duplicates=0
for r in allrows:
    h=hashlib.sha256(norm(r['source']).encode()).hexdigest()
    if r.get('key') in oldkeys or h in oldhash or r.get('key') in seen or h in seen: duplicates+=1; continue
    unique.append(r); seen.update([r.get('key'),h])
# label, severity, primary cause, brief finding, recommended action
J={
'b-8edce287':('minor_wording',1,'MADLAD decode','Error-handling subcategories and the 26-guideline count are retained; wording is awkward.','No targeted change.'),
'b-a6eebbeb':('minor_wording',1,'MADLAD decode','Google, Apple and Microsoft comparison and the human-centered design question are preserved.','No targeted change.'),
'b-3b063c6b':('source_fragment',2,'paragraph reconstruction','Source ends mid-word (“keep in min…”); translation completes a fluent claim without the missing source tail.','Improve completeness detection/recovery before translation; do not let the model author missing text.'),
'b-46a55a80':('omission',2,'line grouping','The heading “Value of AI” and five-guideline count are lost from a fused heading/body block.','Separate heading lines and verify category labels/counts survive.'),
'b-ab5550b5':('paragraph_merge',3,'line grouping','Two guideline labels are fused (“understandingConveying…”); output preserves the fusion and is unusable.','Split adjacent list labels using native line geometry/style boundaries.'),
'b-798ca57d':('correct',0,'none','The references and appendix locator are preserved.','No change indicated.'),
'b-049dacd3':('minor_wording',1,'MADLAD decode','Seven-guideline count and examples are preserved; one phrase is awkward.','No targeted change.'),
'b-ec1983b8':('minor_wording',1,'MADLAD decode','Training category, count, examples and product-purpose clause are represented; phrasing is clumsy.','No targeted change.'),
'b-03b43602':('minor_wording',1,'MADLAD decode','High-level data questions and example actions remain, with awkward clause ordering.','No targeted change.'),
'b-35aa9557':('correct',0,'none','Deployment, continuous fine-tuning and error handling are preserved.','No change indicated.'),
'b-f204c90b':('minor_wording',1,'MADLAD decode','The 24-guideline count and mental-model/user-trust relation are retained.','No targeted change.'),
'b-e66cddb0':('terminology_error',2,'MADLAD decode','Most abbreviations and p<0.05 remain, but the standardized memory-test and resistance-training expansions drift.','Evaluate named-test/intervention terms on a separate development set while retaining abbreviations.'),
'b-0b6eb824':('semantic_shift',3,'MADLAD decode','“All procedures” becomes “all surgeries,” changing a study-protocol statement into a surgical claim.','Evaluate event/entity-role preservation on method prose using clean controls.'),
'b-33c99e7a':('terminology_error',2,'MADLAD decode','“Quantified self” becomes “quantitative self-trend”; block also ends incomplete and citations detach.','Check construct-term fidelity and clause/citation attachment after source repair.'),
'b-c1789884':('minor_wording',1,'MADLAD decode','Industrial-operator and autonomy claims are largely preserved; wording is awkward.','Verify paragraph completeness; no gate change.'),
'b-0b6fbfb4':('semantic_shift',2,'MADLAD decode','Abolishing operations make consequences less effective in the source; the Japanese changes this to “not more efficient.”','Test direction and construct-role preservation on independent paired EO/AO examples.'),
}
PAPER_DISCIPLINE={'human-ai-interaction-guidelines':'HCI','cognitive-dual-task-older-adults':'cognitive psychology','ergonomics-quantified-factory-worker':'ergonomics','marketing-neurophysiology-consumer-motivation':'marketing'}
accepted=[r for r in unique if r.get('translation') and not r.get('readerVisibleFallback') and not r.get('partialSourceFallback')]
reviews=[]
for r in accepted:
    label,severity,cause,finding,fix=J[r['blockId']]
    reviews.append({'key':r['key'],'paperId':r['paperId'],'blockId':r['blockId'],'discipline':PAPER_DISCIPLINE[r['paperId']],'sourceCategory':r['sourceCategory'],'automaticQualityScore':(r.get('quality') or {}).get('score'),'automaticGate':'accepted','readerVisibleFallback':False,'label':label,'severity':severity,'primaryCause':cause,'secondaryCauses':['quality gate accepted despite reviewed issue'] if severity>=2 else [],'sourceExcerpt':norm(r['source'])[:220],'translationExcerpt':norm(r['translation'])[:240],'finding':finding,'recommendedFix':fix})
ordinary=[r for r in unique if r['sourceCategory']=='ordinary-body-prose']; ordinary_rev=[r for r in reviews if r['sourceCategory']=='ordinary-body-prose']; severe=[r for r in reviews if r['severity']>=2]
stages=collections.Counter(r['fallbackStage'] for r in unique); cats=collections.Counter(r['sourceCategory'] for r in unique)
bydisc={}
for dname in sorted(set(PAPER_DISCIPLINE.values())):
    rs=[r for r in ordinary if PAPER_DISCIPLINE[r['paperId']]==dname]; ar=[r for r in ordinary_rev if r['discipline']==dname]; s=sum(r['severity']>=2 for r in ar)
    bydisc[dname]={'uniqueOrdinaryRows':len(rs),'readerVisibleFallbacks':sum(bool(r['readerVisibleFallback']) for r in rs),'acceptedManuallyReviewed':len(ar),'severityGte2Accepted':s,'unsafeFalseAcceptRateAmongAccepted':f'{s}/{len(ar)}' if ar else None}
review={'version':'semantic-review-v104-quality-v9-fresh-four-v1','reviewer':'assistant manual source-to-output comparison; all unique accepted rows reviewed','benchmark':str(bench),'deduplication':{'selectedRows':len(allrows),'duplicateStableKeyOrExactWhitespaceNormalizedSource':duplicates,'uniqueRows':len(unique),'rule':'Exclude stable key or SHA-256 of whitespace-normalized source seen in prior local translation-audit reports; deduplicate within v104.'},'coverage':{'selectedPapers':4,'uniqueRows':len(unique),'uniqueRowsBySourceCategory':dict(cats),'uniqueRowsByStage':dict(stages),'preModelFallbacks':stages['pre-model'],'postModelFallbacks':stages['post-model'],'accepted':len(reviews),'ordinaryBodyUniqueRows':len(ordinary),'ordinaryBodyFallbacks':sum(bool(r['readerVisibleFallback']) for r in ordinary),'ordinaryBodyFallbackRate':f"{sum(bool(r['readerVisibleFallback']) for r in ordinary)}/{len(ordinary)} ({sum(bool(r['readerVisibleFallback']) for r in ordinary)/len(ordinary)*100:.1f}%)",'ordinaryBodyAcceptedManuallyReviewed':len(ordinary_rev),'ordinarySeverityGte2':sum(r['severity']>=2 for r in ordinary_rev),'ordinaryUnsafeFalseAcceptRate':f"{sum(r['severity']>=2 for r in ordinary_rev)}/{len(ordinary_rev)} ({sum(r['severity']>=2 for r in ordinary_rev)/len(ordinary_rev)*100:.1f}%)",'allAcceptedSeverityGte2':len(severe),'allAcceptedUnsafeFalseAcceptRate':f"{len(severe)}/{len(reviews)} ({len(severe)/len(reviews)*100:.1f}%)",'disciplineBreakdown':bydisc},'severityCountsAmongAccepted':dict(collections.Counter(str(r['severity']) for r in reviews)),'failureCountsAmongAccepted':dict(collections.Counter(r['label'] for r in reviews)),'causeCountsAmongSeverityGte2':dict(collections.Counter(r['primaryCause'] for r in severe)),'interpretation':'Fresh source-hash cohort across four papers, separate from v102/v103; purposive sample, not a population estimate. This cohort is held out from rule tuning. Several fused heading/list units were mislabeled ordinary body and are attributed to extraction line grouping.','reviews':reviews}
out=root/'semantic-review-v104-quality-v9-fresh-four.json'; out.write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
print('selected',len(allrows),'duplicates',duplicates,'unique',len(unique),'accepted reviewed',len(reviews),'severity>=2',len(severe),'ordinary',len(ordinary),'ordinary accepted',len(ordinary_rev),'ordinary>=2',sum(r['severity']>=2 for r in ordinary_rev),'ordinary fallback',sum(bool(r['readerVisibleFallback']) for r in ordinary))
