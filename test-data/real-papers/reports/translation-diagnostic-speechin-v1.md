# Real-paper translation audit (local, uncommitted)

- Generated: 2026-10-05T08:24:47.733Z
- Endpoint: http://127.0.0.1:8765
- Server status at start: 3b-mt-v6-transformers-4.57.6-semantic-v84-source-protect-v29-space-footnote-citation-bracket-author-year-tail-restore-strict-restore-v28-quality-v36-relation-condition-beam-v8-section-marker-contextual-number-citation-group-foreign-script-hangul-supplementary-ref-inventory-long-claim-quoted-boundary-repeat-token-dense-citation-claim-compression-beam-v2-identifier-glue-simplified-cjk-rescue-quoted-label-policy (mps; phase=ready)
- Papers evaluated: 1/1
- Evaluable units: 4; model responses: 2; original fallbacks: 2 (50.0% of evaluable); partial source fallbacks inside accepted output: 0; fully translated accepts: 2; failed/pending requests: 0
- Ordinary-body fallback: 0/1 (0.0% of evaluable ordinary-body units)
- Score below 0.80: 0; rejected by the production quality gate: 0
- Blocked by the production input policy before model submission: 2
- Units needing structural review: 1
- Source categories:
- damaged-extraction: 2 rows (2 evaluable); accepts 0; fully translated accepts 0; partial source fallbacks 0; fallbacks 2 (100.0% of evaluable)
- list: 1 rows (1 evaluable); accepts 1; fully translated accepts 1; partial source fallbacks 0; fallbacks 0 (0.0% of evaluable)
- ordinary-body-prose: 1 rows (1 evaluable); accepts 1; fully translated accepts 1; partial source fallbacks 0; fallbacks 0 (0.0% of evaluable)

Automatic checks catch malformed output and preservation failures. They do **not** establish semantic equivalence; every row below is a source/translation review queue.

## speechin — SpeeChin: A Smart Necklace for Silent Speech Recognition

Disciplines: unclassified

### b-f0741298 · pages 2–3

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: cross-page logical block
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: structural skip; preserved in source; server fallback: none
- Invariants: [19], [7, 55], [33, 34, 58, 70], [4, 9, 29, 36, 37, 57], [18, 32, 40], [27, 50, 51], [38, 43], [39], Figure 1, 90.5%, 91.6%, 90%, SSR, EEG, sEMG, SpeeChin, IR, CRNN, 54, 44, 20, 10, 72
- Technical-name audit: SpeeChin, English, Chinese, CRNN; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Silent speech recognition (SSR) was invented as an alternative input method for scenarios where vocalizing speech is inappropriate, or speech recognition is compromised by high background noise or for people who have challenges in vocalizing speech [19]. It recognizes speech without requiring the user to voice any sounds into the environment. Researchers have developed a variety of SSR technologies. Based on whether the sensing technology is worn on the body, existing SSR techniques can be classified into two categories: wearable and non-wearable approaches. Most non-wearable SSR techniques use frontal cameras to capture the face and lip movements to distinguish silent speech commands. However, these systems require the user to be in front of a camera without occlusion, which is neither sustainable nor socially appropriate in daily activities. Wearable-based SSR techniques usually attach different sensors (e.g., EEG [7, 55], sEMG [33, 34, 58, 70], magnetic [4, 9, 29, 36, 37, 57], ultrasonic [18, 32, 40], acoustic [27, 50, 51], capacitive [38, 43]), camera [39] on or around the head to detect the movements of articulators (e.g., skin, ear, tongue, muscles) involved in speech. However, compared to non-wearable-based SSR methods, wearable-based approaches have limitations. Some require the user to attach electrodes on the face or mouth, which is uncomfortable in real-life scenarios. Others do not work well after remounting the sensor, or can only recognize a small set of commands[39]. Thus, there is an apparent need for a minimally obtrusive wearable sensing device that can recognize a rich set of silent speech commands without compromising comfort or performance. To address this challenge, we present SpeeChin, the first necklace-based SSR technology that can recognize 54 English and 44 Chinese silent speech commands. It uses a customized neck-mounted IR camera to capture the images of the neck and face from under the chin. These images are pre-possessed and sent to an end-to-end convolutional-recurrent-neural-network (CRNN) model for silent speech recognition. An overview of SpeeChin is illustrated in Figure 1. A user study with 20 participants shows that it can recognize 54 English commands and 44 Chinese commands with an average accuracy of 90.5% and 91.6%, respectively. Unlike standard voice recognition systems, current wearable SSR devices can only recognize a limited set of pre-trained words. However, if they could recognize sound on a phoneme level, they could instead map phoneme patterns to words, allowing them to recognize a much larger dataset without the need for word-level training. To investigate the potential of SpeeChin on distinguishing between more silent speech commands, we conducted a third study with 10 participants to recognize 72 one-syllable nonwords. The results are presented and analyzed in the discussion section. To the best of our knowledge, SpeeChin is the first smart necklace that can recognize silent speech phrases in two languages (54 English and 44 Chinese commands) with over 90% accuracy after remounting the device (session-independently) without using frontal cameras. The contributions of SpeeChin are:

**Japanese**

[original fallback]

### b-29bed79d · pages 1

- Role: paragraph; quality: 1; production decision: accept; warnings: none
- Source category: ordinary-body-prose; fallback stage: none; fallback reason: none; server fallback: none
- Invariants: 90.5%, 91.6%, SpeeChin, IR, CRNN, 54, 44, 20, 10, 72
- Technical-name audit: SpeeChin, English, Chinese, CRNN; missing from output: English, Chinese
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

This paper presents SpeeChin, a smart necklace that can recognize 54 English and 44 Chinese silent speech commands. A customized infrared (IR) imaging system is mounted on a necklace to capture images of the neck and face from under the chin. These images are first pre-processed and then deep learned by an end-to-end deep convolutional-recurrent-neural-network (CRNN) model to infer different silent speech commands. A user study with 20 participants (10 participants for each language) showed that SpeeChin could recognize 54 English and 44 Chinese silent speech commands with average cross-session accuracies of 90.5% and 91.6%, respectively. To further investigate the potential of SpeeChin in recognizing other silent speech commands, we conducted another study with 10 participants distinguishing between 72 one-syllable nonwords. Based on the results from the user studies, we further discuss the challenges and opportunities of deploying SpeeChin in real-world applications.

**Japanese**

54の英語と44の中国語の無声音声コマンドを認識するスマートネックレスSpeeChinを紹介した。ネックレスに装着したカスタム赤外線イメージングシステムは, 頚部と顔の顔面からの画像を捕捉する。これらの画像を最初に予備処理し, 次にエンドツーエンドの深い巻き込み再帰ニューラルネットワーク(CRNN)モデルによって深く学習し, 異なる無声音声コマンドを推論する。20人の参加者(各言語10人)を対象としたユーザ研究では,SpeeChinは54の英語と44の中国語の無声音声コマンドを認識でき, クロスセッション平均精度はそれぞれ90.5%と91.6%であった。また,SpeeChinの他の無声音声コマンドの認識に対する可能性を調べるため,10人の参加者を対象に72の一音節非単語の識別を行った。ユーザ研究の結果に基づいて, 実世界の応用におけるSpeeChinの展開の課題と機会を議論した。

### b-f0741298-4 · pages 2–3

- Role: paragraph; quality: 1; production decision: accept; warnings: cross-page logical block, list-item boundary
- Source category: list; fallback stage: none; fallback reason: none; server fallback: none
- Invariants: SpeeChin, 10
- Technical-name audit: SpeeChin; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

• We conducted another user study with 10 participants to understand how SpeeChin can distinguish between phonemes and conducted a corresponding linguistic analysis.

**Japanese**

• また,10名のユーザを対象に,SpeeChinがどのように音素を区別するかを理解するためのユーザー研究を行い, それに対応した言語解析を行った。

### b-4d4d581c · pages 4

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 段落の末尾が欠けている可能性があります
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: 段落の末尾が欠けている可能性があります; server fallback: none
- Invariants: [38, 43], SSR, 4, 9, 29, 36, 37, 57
- Technical-name audit: none; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Besides movement on the surface of the head, vocalizing speech also involves movements of different articulators (e.g., mouth, tongue) inside the mouth. To capture the tongue and mouth movements for SSR, researchers placed magnets on the tongue and head [4, 9, 29, 36, 37, 57 ], and capacitive sensors in the mouth [38, 43]. Tongue movement can also be inferred by placing medical-purpose ultrasonic probes tightly under the chin for SSR

**Japanese**

[original fallback]

