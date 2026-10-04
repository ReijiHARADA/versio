# Real-paper translation audit (local, uncommitted)

- Generated: 2026-10-03T15:04:35.379Z
- Endpoint: http://127.0.0.1:8765
- Server status at start: unknown (unknown; phase=unknown)
- Papers evaluated: 3/3
- Evaluable units: 12; model responses: 0; original fallbacks: 12 (100.0% of evaluable); partial source fallbacks inside accepted output: 0; fully translated accepts: 0; failed/pending requests: 0
- Ordinary-body fallback: 4/4 (100.0% of evaluable ordinary-body units)
- Score below 0.80: 0; rejected by the production quality gate: 0
- Blocked by the production input policy before model submission: 8
- Units needing structural review: 0
- Source categories:
- damaged-extraction: 5 rows (5 evaluable); accepts 0; fully translated accepts 0; partial source fallbacks 0; fallbacks 5 (100.0% of evaluable)
- list: 2 rows (2 evaluable); accepts 0; fully translated accepts 0; partial source fallbacks 0; fallbacks 2 (100.0% of evaluable)
- ordinary-body-prose: 4 rows (4 evaluable); accepts 0; fully translated accepts 0; partial source fallbacks 0; fallbacks 4 (100.0% of evaluable)
- reference-chrome: 1 rows (1 evaluable); accepts 0; fully translated accepts 0; partial source fallbacks 0; fallbacks 1 (100.0% of evaluable)

Automatic checks catch malformed output and preservation failures. They do **not** establish semantic equivalence; every row below is a source/translation review queue.

## heldout-computational-linguistics-nlp-translation — Computational linguistics and Natural Language Processing

Disciplines: unclassified

### b-b583c28b · pages 1

- Role: paragraph; quality: request failed; production decision: original fallback after quality gate; warnings: none
- Source category: ordinary-body-prose; fallback stage: post-model; fallback reason: none; server fallback: none
- Invariants: none
- Technical-name audit: none; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

This chapter provides an introduction to computational linguistics methods, with focus on their applications to the practice and study of translation. It covers computational models, methods and tools for collection, storage, indexing and analysis of linguistic data in the context of translation, and discusses the main methodological issues and challenges in this field. While an exhaustive review of existing computational linguistics methods and tools is beyond the scope of this chapter, we describe the most representative approaches, and illustrate them with descriptions of typical applications.

**Japanese**

[original fallback]

### b-36e302e9 · pages 1

- Role: paragraph; quality: request failed; production decision: original fallback after quality gate; warnings: none
- Source category: ordinary-body-prose; fallback stage: post-model; fallback reason: none; server fallback: none
- Invariants: 1
- Technical-name audit: none; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Broadly defined, the term computational linguistics refers to the use of computational methods and tools in the study of linguistic phenomena. A distinction is sometimes made between computational linguistics and natural language processing. The former is usually regarded as the study of linguistic ability as a computational process, and the latter as an “engineering” pursuit directed towards the application of algorithmic methods to practical problems such as automatic categorisation of text, parsing, prediction of the part-of-speech (categories) of words, automatic translation, text summarisation and other tasks, all of which involve processing of natural languages1 (as opposed to formal or programming languages). As the boundaries between computational linguistics and natural language processing are not always clearly defined, we will not concern ourselves with this distinction here. Therefore, our use of the term computational linguistics in this chapter will encompass the methods and tools these fields share in common, with a focus on methodology and its relation to translation practice and enquiry.

**Japanese**

[original fallback]

### b-bb456d07 · pages 4

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 段落の末尾が欠けている可能性があります, starts like continuation
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: 段落の末尾が欠けている可能性があります; server fallback: none
- Invariants: 2021, 1999, 2014, 2011, WordSmith, MonoConc, ParaConc, TEC
- Technical-name audit: WordSmith, MonoConc, ParaConc, Sketch, Engine, Kilgarriff; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

One of the most popular tool set distributed in the conventional way is WordSmith tools (Scott 2021). WordSmith tools is a robust and stable set of tools which has been used in a number of papers in lexicography and translation studies. However, it only runs on Windows platforms, which limits its accessibility. Other similar concordance software such as MonoConc and ParaConc (Barlow 1999) also have this limitation. Possibly the best known example of web-based corpus tools is the Sketch Engine (Kilgarriff et al. 2014). This tool, which runs entirely on web browsers capable of running Javascript has had great impact on corpus and lexicography research. Finally, an example of a mixed distribution mode is the modnlp/tec tool (Luz 2011), which is distributed using Java Web Start technology and runs as a stand-alone client on the user’s computer, typically interacting with a remote server. The modnlp software suite runs on most computer operating systems, and has been used extensively in translation studies, having been initially developed for the translational English corpus, TEC (Baker 1999), and having since been used in a number of other applications, most recently the Genealogies of Knowledge projects

**Japanese**

[original fallback]

### b-f4d58532 · pages 7

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: none
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: structural skip; preserved in source; server fallback: none
- Invariants: 1991, 1999
- Technical-name audit: none; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Some of the functions of the above described tools, and others like them, draw mostly on the notion of collocation (Sinclair 1991). Collocations are words that occur together often enough to be noticed as textual units, being referred to in the context of translation as terms. In this sense, terminology extraction is a task related to translation which employs computational linguistic methods. In addition to descriptive methods, such as concordancing, quantitative analytic methods are employed to determine how often is often enough as a pattern of word co-occurrence. The basic framework is one of hypothesis testing, where one wishes to assess whether a given co-occurrence pattern forms a collocation or is a merely “accidental” cooccurrence (Manning and Sch¨utze 1999). Accidental co-occurrence has been equated with statistical independence, in a probabilistic framework. Thus, the null hypothesis in a test of statistical significance is formulated as the statement that P(x,

**Japanese**

[original fallback]

## heldout-osworld-multimodal-agents — OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments

Disciplines: unclassified

### b-cd7ebd0d · pages 17

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 段落の末尾が欠けている可能性があります
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: 段落の末尾が欠けている可能性があります; server fallback: none
- Invariants: OSWORLD
- Technical-name audit: OSWORLD; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

In conclusion, the introduction of OSWORLD marks a significant step forward in the development of autonomous digital agents, addressing critical gaps in existing interactive learning environments. By providing a rich, realistic setting that spans multiple operating systems, interfaces, and applications, OSWORLD not only broadens the scope of tasks digital agents can perform but also enhances their potential for real-world application. Despite the promise shown by advancements in vision-language models, evaluations within OSWORLD reveal notable challenges in agents’ abilities, particularly in

**Japanese**

[original fallback]

### b-5e3f0843 · pages 16

- Role: paragraph; quality: request failed; production decision: original fallback after quality gate; warnings: none
- Source category: ordinary-body-prose; fallback stage: post-model; fallback reason: none; server fallback: none
- Invariants: Fig. 10, GUI, 2
- Technical-name audit: Internet; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Tasks where humans outperform agents These tasks mainly involve text-based and design-related work, such as “bold the font on this slide and add notes” or “erase all the highlighted marks in this document” (Fig. 10 Line 2). Since the Internet lacks such fine-grained data as the software execution process, the agent also lacks the corresponding training process, so its grounding ability is not good enough. The lack of understanding of GUI logic also causes poor performance on operations like selecting and scrolling.

**Japanese**

[original fallback]

### b-8207e996 · pages 4

- Role: paragraph; quality: request failed; production decision: original fallback after quality gate; warnings: none
- Source category: ordinary-body-prose; fallback stage: post-model; fallback reason: none; server fallback: none
- Invariants: VM, 5
- Technical-name audit: APIs; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Many real-world scenarios requiring assistance occur not at the beginning of digital activities, such as right after launching an application or when a computer has just been started, but rather at intermediate stages, such as when certain software is already open or the computer has experienced a crash. Therefore, we aim to simulate these intermediate states as closely as possible to replicate realworld scenarios. The naturalness we bring in also leads to more challenges for agents to model and explore. We adopted a hybrid approach for configuration instead of solely relying on example-wise snapshots for restoration since it would store much unnecessary hardware state information, resulting in each example requiring gigabytes of space. The procedure is divided into three stages: start the VM emulator, prepare files (download the files or scripts from the cloud, etc. optional), and execute reprocessing commands (open files or tabs, change the window size, etc. optional). We provide convenient APIs to configure initial conditions and world settings, standardizing our tasks to make this process user-friendly and easily extendable for scaling. For more details on setup see App. B.5.

**Japanese**

[original fallback]

### b-1945f2b5 · pages 1

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: none
- Source category: reference-chrome; fallback stage: pre-model; fallback reason: structural skip; preserved in source; server fallback: none
- Invariants: https://os-world.github.io., OSWORLD, macOS, OS, LLM, VLM, GUI, 369, 72.36, 12.24
- Technical-name audit: OSWORLD; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Autonomous agents that accomplish complex computer tasks with minimal human interventions have the potential to transform human-computer interaction, signif-icantly enhancing accessibility and productivity. However, existing benchmarks either lack an interactive environment or are limited to environments specific to certain applications or domains, failing to reflect the diverse and complex nature of real-world computer use, thereby limiting the scope of tasks and agent scalability. To address this issue, we introduce OSWORLD, the first-of-its-kind scalable, real computer environment for multimodal agents, supporting task setup, execution-based evaluation, and interactive learning across various operating systems such as Ubuntu, Windows, and macOS. OSWORLD can serve as a unified, integrated computer environment for assessing open-ended computer tasks that involve arbitrary applications. Building upon OSWORLD, we create a benchmark of 369 computer tasks involving real web and desktop apps in open domains, OS file I/O, and workflows spanning multiple applications. Each task example is derived from real-world computer use cases and includes a detailed initial state setup configuration and a custom execution-based evaluation script for reliable, reproducible evaluation. Extensive evaluation of state-of-the-art LLM/VLM-based agents on OSWORLD reveals significant deficiencies in their ability to serve as computer assistants. While humans can accomplish over 72.36% of the tasks, the best model achieves only 12.24% success, primarily struggling with GUI grounding and operational knowledge. Comprehensive analysis using OSWORLD provides valuable insights for developing multimodal generalist agents that were not possible with previous benchmarks. Our code, environment, baseline models, and data are publicly available at https://os-world.github.io.

**Japanese**

[original fallback]

## heldout-medical-deep-learning-meta-review — Medical deep learning—A systematic meta-review

Disciplines: unclassified

### b-15e8f42f-4 · pages 9

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 抽出時に機能語が欠落している可能性があります, list-item boundary
- Source category: list; fallback stage: pre-model; fallback reason: 抽出時に機能語が欠落している可能性があります; server fallback: none
- Invariants: [49], CT
- Technical-name audit: none; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

– Radiology is the medical field of extracting information from images, like computed tomography (CT) or for diagnosis and treatment of humans and animals. In their view, Mazurowski et al. [49] give an introduction about the of radiology and outline open research questions that could tackled with deep learning techniques. They further provide overview of basic deep learning concepts, such as convolutional neural networks. Next, they outline deep learning-based research contributions published within the radiology discipline. Thereby, they organize the reviewed works by the specific type of tasks aim to support. They conclude their work by discussing remaining problems, but also highlight opportunities for using deep learningbased approaches within the practice of radiology.

**Japanese**

[original fallback]

### b-9fadb374-2 · pages 12

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 抽出時の改行ハイフンが残っている可能性があります, list-item boundary
- Source category: list; fallback stage: pre-model; fallback reason: 抽出時の改行ハイフンが残っている可能性があります; server fallback: none
- Invariants: [62], PubMed
- Technical-name audit: PubMed; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

– A physician or doctor who is specialized in the treatment of cancer using ionizing radiation, like radionuclides or megavoltage X-rays, is called a radiation oncologist. In that context, Boldrini et al. [62] perform a literature review in com- PubMed/Medline with a search strategy including the search terms anal- “radiotherapy” and “deep learning”. They identify recent publicacov- tions on deep learning in radiation oncology, which they present with a focus on clinically oriented readers. The review shows how addi- deep learning can support clinicians during their daily work, such the as by reducing segmentation times, or predicting treatment outde- comes and toxicities. However, they conclude that these techniques have yet to be employed in the clinical routine, and it remains to dis- be seen how well they translate into practice. cov- Drug-drug interaction

**Japanese**

[original fallback]

### b-68a9f733 · pages 6

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 抽出時の改行ハイフンが残っている可能性があります, starts like continuation
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: 抽出時の改行ハイフンが残っている可能性があります; server fallback: none
- Invariants: [38], DNA, NGS
- Technical-name audit: EMGs, EEGs, ECGs, EOGs; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

that applications that exploit physiological signals. Their bibliometric addi- review revealed that the analyzed contributions focused mainly on Electromyograms (EMGs), Electroencephalograms (EEGs), Elec-the trocardiograms (ECGs) and Electrooculograms (EOGs). Hence, they used these four categories to structure the content of their survey. DNA sequencing – Deoxyribonucleic acid (DNA) sequencing is the determination procedure to reveal the order of nucleotides in DNA. Celesti et al. [38] review deep learning-based approaches to accelerate the process of DNA sequencing, given that huge amount of genomics data is emerging from next-generation sequencing (NGS) techniques. They provide a taxonomic analysis, by outlining visu- the main deep learning-based NGS tools and software, and discuss

**Japanese**

[original fallback]

### b-f3684346 · pages 1

- Role: paragraph; quality: request failed; production decision: original fallback before model; warnings: 段落の末尾が欠けている可能性があります
- Source category: damaged-extraction; fallback stage: pre-model; fallback reason: 段落の末尾が欠けている可能性があります; server fallback: none
- Invariants: 2, 2020, Q2, PubMed, 11
- Technical-name audit: PubMed; missing from output: none
- Citation-placement audit: none
- Acronym-expansion audit: none
- Compression audit: none

**Source**

Deep learning has remarkably impacted several different scientific disciplines over the last few years. For example, in image processing and analysis, deep learning algorithms were able to outperform other cutting-edge methods. Additionally, deep learning has delivered state-of-the-art results in tasks like autonomous driving, outclassing previous attempts. There are even instances where deep learning outperformed humans, for example with object recognition and gaming. Deep learning is also showing vast potential in the medical domain. With the collection of large quantities of patient records and data, and a trend towards personalized treatments, there is a great need for automated and reliable processing and analysis of health information. Patient data is not only collected in clinical centers, like hospitals and private practices, but also by mobile healthcare apps or online websites. The abundance of collected patient data and the recent growth in the deep learning field has resulted in a large increase in research efforts. In Q2/2020, the search engine PubMed returned already over 11,000 results for the search term

**Japanese**

[original fallback]

