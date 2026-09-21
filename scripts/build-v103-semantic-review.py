import collections, hashlib, json, pathlib, re

ROOT = pathlib.Path('test-data/real-papers/reports')
BENCH = ROOT / 'translation-audit-v103-quality-v9-low-sampled-four-24.json'
PAPER_DISCIPLINE = {
    'ergonomics-job-rotation-robotics': 'ergonomics',
    'linguistics-register-web-corpus': 'linguistics',
    'cognitive-memory-cue-interest': 'cognitive psychology',
    'marketing-health-goals-nudging': 'marketing',
}
J = {
 'b-56dfc04f': ('semantic_shift',3,'MADLAD decode',['quality gate accepted malformed technical notation'],'Variable definitions are concatenated and symbol-to-description boundaries are unclear, so researchers cannot safely recover the model variables.','Validate symbol-definition lists structurally; do not treat malformed label runs as ordinary prose.'),
 'b-84ac08a9': ('minor_wording',1,'MADLAD decode',[],'The keyword list is substantially preserved and remains understandable.','No targeted change; monitor terminology consistency.'),
 'b-3ae55bfe': ('source_fragment',2,'paragraph reconstruction',['MADLAD completed an unfinished source clause','source-integrity gate accepted a truncated block'],'The source stops after “thus enabling different”; translation completes the object as different work/task. The PDF page continues beyond this block, so this is a source-boundary failure and the completion is not licensed by the supplied text.','Improve source-completeness checks and neighbor stitching; preserve source fragment rather than silently completing it.'),
 'b-9e0a27cc': ('omission',2,'PDF extraction',['quality gate accepted corrupted source'],'Replacement characters occupy the formula span. Translation drops the formula and cannot reproduce the stated calculation; source-integrity was incorrectly treated as clean.','Detect replacement glyphs and missing formula spans before translation; show source warning or image fallback.'),
 'b-1c1726ed': ('source_fragment',3,'paragraph reconstruction',['MADLAD omitted/reattached claims','quality gate accepted a long damaged block'],'Long block ends mid-sentence and contains multiple comparison details; translation omits/reattaches claims and ends incomplete.','Repair paragraph boundaries/truncation before translation; evaluate only after complete logical unit recovery.'),
 'b-ceee9b76': ('semantic_shift',3,'MADLAD decode',['source block ends mid-sentence','quality gate accepted relation drift'],'“Pseudo-random Google searches” is corrupted to “Gugle” and the claim about representing the range users encounter is weakened. Major drift also occurs before the truncated ending.','Measure entity/action and representativeness relation preservation on clean development paragraphs.'),
 'b-1d4f62b8': ('omission',3,'MADLAD decode',['source truncated at end','quality gate accepted substantial omissions'],'Translation loses method details about resampling distinct CORE parts, measuring dependence on specific parts, and repeated feature-reduction runs; the stability method changes materially.','Test method-step/list-member retention and ensure source units are complete before semantic acceptance.'),
 'b-f1d25058': ('terminology_error',2,'MADLAD decode',['quality gate accepted domain-term substitutions'],'“Web genres” and “web-as-corpus” become incorrect or malformed terms, reducing the usefulness of this keyword list.','Assess terminology on an independent linguistics development set; avoid fitting to this held-out phrase list.'),
 'b-73aae7ae': ('terminology_error',2,'MADLAD decode',['quality gate accepted construct-term drift'],'The research questions remain structured, but “online registers” becomes “online registry,” obscuring the paper’s central linguistic construct.','Test construct-term hints on a separate development corpus with correct ordinary controls.'),
 'b-ff6a0ab0': ('omission',2,'MADLAD decode',['quality gate accepted lost contrast'],'Country counts remain, but the contrast that these features align with news topics rather than the register is omitted.','Evaluate contrastive relation retention, not numeric presence alone.'),
 'b-c3e07c12': ('minor_wording',1,'MADLAD decode',[],'Main ordering and F1 ranges are broadly preserved; awkward category phrasing does not materially change the result.','No targeted change from this held-out example.'),
 'b-f22987de': ('omission',2,'MADLAD decode',['source block is lengthy and truncated','quality gate accepted partial coverage'],'Several qualifications and future-study details in the limitations passage are lost or compressed; the source also ends incomplete.','Track source completeness and clause coverage; evaluate long discussion units on a development set.'),
 'b-b3904f0d': ('minor_wording',1,'MADLAD decode',[],'Meaning is preserved: materials were presented in Chinese and translated into English for illustration.','No targeted change.'),
 'b-7d4eac65': ('omission',3,'MADLAD decode',['quality gate accepted omission of comparison/result relation'],'The result omits the decisive comparison that gist-cued clips outperformed detailed-cued clips among less-interested participants. This changes the experimental finding.','Evaluate comparative outcome and cue/group assignment preservation on independent result sentences.'),
 'b-66bc77dc': ('minor_wording',1,'MADLAD decode',[],'The measured constructs and mobile eye-tracker detail are retained; list phrasing is slightly awkward but clear.','No targeted change.'),
 'b-f94ca700': ('minor_wording',1,'MADLAD decode',[],'Nudge/control design, random assignment, product-image manipulation and dependent variable are retained.','No targeted change; include ordinary-method controls in broader tests.'),
 'b-6f72eb43': ('minor_wording',1,'MADLAD decode',[],'Frequency, device, calibration and fixation coding are mostly retained; a software name is misspelled and phrasing is rough.','Track proper-name/tool-name preservation separately; meaning remains recoverable.'),
 'b-cd9349f7': ('semantic_shift',2,'MADLAD decode',['quality gate accepted ambiguous measure label'],'“Control measures” becomes ambiguous Japanese that may imply control actions rather than measured participant characteristics used to check randomization.','Evaluate experiment-design role labels (condition, measure, assignment, interaction) on clean methods controls.'),
 'b-b70998b0': ('minor_wording',1,'MADLAD decode',[],'Main conclusion is preserved: nudging worked when goals aligned and attention did not hinder the effect. Opening sentence is awkward.','No targeted change.'),
}

def norm(s): return re.sub(r'\s+', ' ', s or '').strip()
bench=json.loads(BENCH.read_text())
oldkeys=set(); oldhash=set()
for path in ROOT.glob('translation-audit-*.json'):
    if path.name.startswith('translation-audit-v103-'): continue
    try: data=json.loads(path.read_text())
    except Exception: continue
    def walk(x):
        if isinstance(x,dict):
            if isinstance(x.get('source'),str):
                if x.get('key'): oldkeys.add(x['key'])
                oldhash.add(hashlib.sha256(norm(x['source']).encode()).hexdigest())
            for value in x.values(): walk(value)
        elif isinstance(x,list):
            for value in x: walk(value)
    walk(data)
rows=[r for p in bench['papers'] for r in p['rows']]
unique=[]; seen=set(); duplicates=0
for row in rows:
    h=hashlib.sha256(norm(row['source']).encode()).hexdigest()
    if row.get('key') in oldkeys or h in oldhash or row.get('key') in seen or h in seen:
        duplicates+=1; continue
    unique.append(row); seen.update([row.get('key'),h])
accepted=[r for r in unique if r.get('translation') and not r.get('readerVisibleFallback') and not r.get('partialSourceFallback')]
reviews=[]
for row in accepted:
    suffix=row['blockId']
    if suffix not in J: raise RuntimeError('Missing manual judgment: '+row['key'])
    label,severity,primary,secondary,finding,fix=J[suffix]
    reviews.append({'key':row['key'],'paperId':row['paperId'],'blockId':suffix,'discipline':PAPER_DISCIPLINE[row['paperId']],'sourceCategory':row['sourceCategory'],'automaticQualityScore':(row.get('quality') or {}).get('score'),'automaticGate':'accepted','readerVisibleFallback':False,'label':label,'severity':severity,'primaryCause':primary,'secondaryCauses':secondary,'sourceExcerpt':norm(row['source'])[:240],'translationExcerpt':norm(row['translation'])[:260],'finding':finding,'recommendedFix':fix})
ordinary=[r for r in unique if r['sourceCategory']=='ordinary-body-prose']
ordreviews=[r for r in reviews if r['sourceCategory']=='ordinary-body-prose']
severe=[r for r in reviews if r['severity']>=2]
breakdown={}
for discipline in sorted(set(PAPER_DISCIPLINE.values())):
    dr=[r for r in unique if PAPER_DISCIPLINE[r['paperId']]==discipline and r['sourceCategory']=='ordinary-body-prose']
    da=[r for r in ordreviews if r['discipline']==discipline]
    n=sum(r['severity']>=2 for r in da)
    breakdown[discipline]={'uniqueOrdinaryRows':len(dr),'readerVisibleFallbacks':sum(bool(r['readerVisibleFallback']) for r in dr),'acceptedManuallyReviewed':len(da),'severityGte2Accepted':n,'unsafeFalseAcceptRateAmongAccepted':f'{n}/{len(da)}' if da else None}
report={'version':'semantic-review-v103-quality-v9-low-sampled-four-24-v1','reviewer':'assistant manual source-to-output comparison; all unique accepted rows reviewed','benchmark':str(BENCH),'deduplication':{'selectedRows':len(rows),'duplicateStableKeyOrExactWhitespaceNormalizedSource':duplicates,'uniqueRows':len(unique),'rule':'Exclude if stable key or SHA-256 of whitespace-normalized source exists in any other local translation-audit report; also deduplicate within v103.'},'coverage':{'selectedPapers':4,'uniquePapersWithRows':4,'uniqueRows':len(unique),'uniqueRowsBySourceCategory':dict(collections.Counter(r['sourceCategory'] for r in unique)),'uniqueRowsByStage':dict(collections.Counter(r['fallbackStage'] for r in unique)),'preModelFallbacks':sum(r['fallbackStage']=='pre-model' for r in unique),'postModelFallbacks':sum(r['fallbackStage']=='post-model' for r in unique),'accepted':len(reviews),'overallVisibleFallbackRate':f"{sum(bool(r['readerVisibleFallback']) for r in unique)}/{len(unique)}",'ordinaryBodyUniqueRows':len(ordinary),'ordinaryBodyFallbacks':sum(bool(r['readerVisibleFallback']) for r in ordinary),'ordinaryBodyFallbackRate':f"{sum(bool(r['readerVisibleFallback']) for r in ordinary)}/{len(ordinary)} ({sum(bool(r['readerVisibleFallback']) for r in ordinary)/len(ordinary)*100:.1f}%)",'ordinaryBodyAcceptedManuallyReviewed':len(ordreviews),'ordinarySeverityGte2':sum(r['severity']>=2 for r in ordreviews),'ordinaryUnsafeFalseAcceptRate':f"{sum(r['severity']>=2 for r in ordreviews)}/{len(ordreviews)} ({sum(r['severity']>=2 for r in ordreviews)/len(ordreviews)*100:.1f}%)",'allAcceptedSeverityGte2':len(severe),'allAcceptedUnsafeFalseAcceptRate':f"{len(severe)}/{len(reviews)} ({len(severe)/len(reviews)*100:.1f}%)",'uniqueDisciplines':sorted(set(PAPER_DISCIPLINE.values())),'disciplineBreakdown':breakdown},'severityCountsAmongAccepted':dict(collections.Counter(str(r['severity']) for r in reviews)),'failureCountsAmongAccepted':dict(collections.Counter(r['label'] for r in reviews)),'causeCountsAmongSeverityGte2':dict(collections.Counter(r['primaryCause'] for r in severe)),'interpretation':'This is the expanded 24-block-per-paper continuation of the same purposive four-paper holdout as v102, not an independent cohort and not a tuning set. All unique accepted translations were manually compared. Rates describe the sampled blocks and are not population estimates. Several source-integrity/category classifiers missed truncated or corrupted source units.','reviews':reviews}
out=ROOT/'semantic-review-v103-quality-v9-low-sampled-four-24.json'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('selected',len(rows),'duplicates',duplicates,'unique',len(unique),'accepted reviewed',len(reviews),'severity>=2',len(severe),'ordinary',len(ordinary),'ordinary accepted',len(ordreviews),'ordinary>=2',sum(r['severity']>=2 for r in ordreviews),'ordinary fallback',sum(bool(r['readerVisibleFallback']) for r in ordinary))
