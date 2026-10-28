# Local short-text classifiers for Agent World

Researched 2026-10-29. Goal: label a chat message (up to ~500 tokens) into 3 to 8 fixed labels, on the user's Mac, free, offline, small.
Rule used: a figure appears only with the URL it came from. Anything else is "none published".

## Short answer

- Best fit: a small sentence-embedding model (bge-small-en-v1.5 or all-MiniLM-L6-v2, int8 ONNX, about 23 to 35 MB on disk) plus a logistic-regression head trained on the labelled messages the todo board already holds. Runs in Node through transformers.js / onnxruntime. Retraining the head takes milliseconds and needs no GPU.
- SetFit is the same idea with the embedding model also fine-tuned. Only worth it if the linear head is too weak, and then training is a Python step (not in the Electron app).
- fastText is the smallest (under 1 MB quantised) but needs thousands of labelled examples. A sub-1B LLM (Qwen3.5-0.8B, 533 MB Q4_K_M) is about 20x bigger than needed.
- Jev (TypeSafe AI): nothing published says it can be self-hosted. Hosted early-access API as far as any source says.
- Nobody publishes CPU latency or RAM on an Apple-silicon Mac for these exact models. Measure in the app (see Unknowns).

## Options table

| Option | Disk | RAM | CPU latency per short text | Licence | How to run in Electron/Node | Source |
|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 (22.7M params) + linear head | model.onnx 90.4 MB; int8 23 MB; fp16 45.3 MB; q4 54.6 MB | none published | none published for Mac; see sentence-encoder rows below | Apache-2.0 | transformers.js (Apache-2.0, dtype fp32/fp16/q8/q4) or onnxruntime-node; head = a few KB of weights in JSON | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 ; https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx ; https://github.com/huggingface/transformers.js |
| bge-small-en-v1.5 (33.4M params, 384-d, 512 tokens) + linear head | none published (file sizes not fetched) | none published | none published | MIT | same as above | https://huggingface.co/BAAI/bge-small-en-v1.5 |
| EmbeddingGemma-300M (newer, 768-d, 2048 tokens, Matryoshka 512/256/128) + head | none published | none published | none published | Gemma licence (login and accept terms) | sentence-transformers; no ONNX mention on card | https://huggingface.co/google/embeddinggemma-300m |
| SetFit (fine-tunes a sentence encoder with contrastive pairs, then trains a head) | same as its encoder (paper uses paraphrase-mpnet-base-v2, 110M; RoBERTa-large 355M) | none published | "an order of magnitude or more faster" to train and run than large-model approaches (claim, no figure) | not stated on the pages read; repo not checked | train in Python; docs list an ONNX tutorial for inference (page not read) | https://huggingface.co/blog/setfit ; https://huggingface.co/docs/setfit/index ; https://arxiv.org/abs/2209.11055 |
| Zero-shot NLI: deberta-v3-xsmall-zeroshot-v1.1-all-33 (70.8M params) | 142 MB (F16) | none published | A10G GPU, batch 128: 4,323 texts/s on banking77, 228 to 5,027 across sets. No CPU figure. One forward pass per label per text | MIT | transformers.js / onnx (conversion not verified) | https://huggingface.co/MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33 |
| fastText supervised | quantised model under 1 MB (language-ID example: 350 MB to under 1 MB) | "less than 1MB of memory" (blog claim) | "thousands of documents per second" (blog claim, no hardware) | MIT | C++ CLI/Python bindings; the tutorial links a WebAssembly module; no official Node binding mentioned | https://fasttext.cc/blog/2017/10/02/blog-post.html ; https://fasttext.cc/docs/en/supervised-tutorial.html |
| Qwen3.5-0.8B (0.9B params, released 2026-03-02) instruction LLM, Q4_K_M | 533 MB (Q4_K_M); 812 MB (Q8_0); lowest quant 338 MB (UD-IQ2_XXS); vision mmproj extra 205 MB, not needed for text | none published | none published | Apache-2.0 | node-llama-cpp (MIT, Metal on Mac, prebuilt Mac binaries, can force JSON-schema output) | https://huggingface.co/Qwen/Qwen3.5-0.8B ; https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/tree/main ; https://github.com/withcatai/node-llama-cpp ; release date: https://github.com/QwenLM/Qwen3.8 (listed via search result) |
| Qwen3-0.6B (previous generation), Q8_0 | 639 MB (Q8_0 as read; Q4_K_M not listed) | none published | none published | Apache-2.0 | llama.cpp / node-llama-cpp | https://huggingface.co/Qwen/Qwen3-0.6B-GGUF |
| Gemma 3 270M-it | none published for quantised files (BF16 safetensors, 0.3B params) | none published | none published | Gemma licence (login and accept terms; prohibited-use policy) | llama.cpp / Ollama builds exist | https://huggingface.co/google/gemma-3-270m-it |
| Gemma 4 E2B | none verified | none published | none published | Apache-2.0 per a secondary news source only | n/a | https://datanorth.ai/news/google-releases-gemma-4-open-models (secondary, not Google's card) |
| SmolLM family | newest I could confirm is SmolLM3-3B (3B, Apache-2.0), over the 2B limit; no sub-2B SmolLM3 found | none published | none published | Apache-2.0 | n/a | https://huggingface.co/HuggingFaceTB/SmolLM3-3B |
| TypeSafe Jev (hosted "System One") | not downloadable | n/a | n/a | closed, hosted | HTTPS API only as far as any source says | see Jev section |

Encoder throughput that is published (older hardware, other models, so only a rough order of magnitude): Universal Sentence Encoder 53.5 sentences/s and ConveRT 58.3 sentences/s on CPU, BERT-large 2.4 sentences/s on CPU, batches of 15 (Casanueva et al., 2020, table 5): https://arxiv.org/abs/2003.04807 (text read from the PDF https://arxiv.org/pdf/2003.04807). No machine named in the part read. None of these is MiniLM or bge.

## Jev (TypeSafe AI): self-hosting

- Nothing published says Jev can be self-hosted. The vendor page says only "Try our first System One Model, Jev, in early access" and links to an API console and developer docs; it does not mention self-hosting, on-prem, VPC or open weights: https://typesafe.ai
- KDnuggets: "We also still know very little about Jev's internal architecture, training setup, and model size." Weights and deployment options not mentioned: https://www.kdnuggets.com/what-everyone-is-getting-wrong-about-typesafe-ais-jev
- A search summary (not a fetched page) reports third-party posts saying hosted, closed-weight API, and one Portuguese post saying the enterprise FAQ asks "Can we run Jev in our own VPC or on-premises?" with the answer not retrieved. I did not verify either. Source index: https://horadecodar.com.br/?p=47570
- Community look-alikes (selfjev, jeff, Jev Lite) are not TypeSafe's model. Jev Lite is reported to be a proxy that still calls TypeSafe's API, so it is not offline. Not verified from a primary page.
- Access to console.typesafe.ai returned HTTP 403 to my fetch, so I could not read the docs. Conclusion: for this app (offline, free) Jev is out.

## Accuracy with few labelled examples (published figures)

Intent classification, Banking77 (77 intents, 13,083 queries), accuracy in %, Casanueva et al. 2020, table 3, https://arxiv.org/abs/2003.04807:

| Encoder + classifier | 10 per intent | 30 per intent | full train |
|---|---|---|---|
| BERT fixed (frozen) | 67.55 | 80.07 | 87.19 |
| BERT fine-tuned | 83.42 | 90.03 | 93.66 |
| USE (frozen, 512-d) | 84.23 | 89.74 | 92.81 |
| ConveRT | 83.32 | 89.37 | 93.01 |
| USE + ConveRT | 85.19 | 90.57 | 93.36 |

Same table, CLINC150 (150 intents) 10 / 30 / full: BERT tuned 91.93 / 95.49 / 96.93; USE+ConveRT 93.26 / 96.13 / 97.16. Authors say the detectors train "in minutes on a single CPU".
- These are 77 and 150 labels. A 3 to 8 label problem is far easier, so figures here are a floor, not a forecast. No published figure matches the app's own labels (task vs chat, bug/feature/review/test/git-order): none published.
- MTEB Banking77Classification (logistic regression on frozen embeddings, full training set), bge-small-en-v1.5: accuracy 85.74. Read from the model card YAML: https://huggingface.co/BAAI/bge-small-en-v1.5/raw/main/README.md . A MiniLM-L6 figure was not found in its card: none published there.
- SetFit paper, 8 examples per class (N=8) vs 64 (SetFit with paraphrase-mpnet-base-v2, 110M), table 2, https://arxiv.org/pdf/2209.11055 :
  - Emotion (6 classes): 48.8 at N=8, 76.2 at N=64, fine-tune on full data 92.6.
  - AGNews (4 classes): 82.9 at N=8, 88.0 at N=64, full 93.8.
  - Enron spam (2 classes): 90.1 at N=8, 96.1 at N=64, full 99.0.
  - Average over 5 datasets: 62.3 at N=8 (vs standard fine-tuning 43.0), 75.3 at N=64.
  - RAFT few-shot leaderboard: SetFit RoBERTa-large 71.3, SetFit MPNet 66.9, human baseline 73.5, GPT-3 62.7: https://huggingface.co/blog/setfit
- Zero-shot NLI: the card of deberta-v3-xsmall-zeroshot reports banking77 accuracy 0.627 on a dataset it was trained on, and states it skipped true zero-shot evaluation: https://huggingface.co/MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33 . No zero-shot figure for short chat messages: none published.
- LLM 0.6B to 0.8B zero/few-shot classification accuracy: none published on the cards read (Qwen3.5-0.8B, Qwen3-0.6B, Gemma 3 270M cards give no classification figure; Gemma 3 270M reports reasoning/QA only).

### Labelled examples each option needs

| Option | Needs | Basis |
|---|---|---|
| Embedding + linear head | 10 to 30 per label gave 84 to 90 on 77 intents; 8 per label is the SetFit setting | tables above |
| SetFit | 8 to 16 per label typical | https://huggingface.co/blog/setfit |
| Zero-shot NLI | 0 (label names only); accuracy on own labels none published | model card |
| fastText | a few thousand total (tutorial example: 15,404 questions, 12,404 train); no minimum stated | https://fasttext.cc/docs/en/supervised-tutorial.html |
| LLM prompt | 0 to a handful of in-prompt examples; no published minimum | none published |

## Recommendation

Smallest good-enough option: **embedding model + logistic regression**, int8 ONNX, run by transformers.js in the Electron main process (or a utility process).

- Cost to the user: about 23 MB (all-MiniLM-L6-v2 int8, source in table) on disk, plus onnxruntime-node binaries and the transformers.js package, whose size I did not measure. RAM: none published; measure it (expect order of the model size, not a promise).
- Why not smaller: fastText is under 1 MB but wants thousands of examples; a todo board will have tens to hundreds. Why not larger: an LLM at 533 MB buys zero-shot flexibility the fixed labels do not need, with no published accuracy for it.
- Pick the encoder: all-MiniLM-L6-v2 for the smallest file with a ready int8 ONNX (23 MB, Apache-2.0). bge-small-en-v1.5 (MIT, 512 tokens) has a published Banking77 figure (85.74) and covers the 500-token messages; all-MiniLM truncates at 256 word pieces by default. Since messages reach about 500 tokens, bge-small is the safer default, but its int8 ONNX size was not verified.
- Training from the board: each todo list or category the person assigned is a label. Embed each message once (cache the 384-d vector next to the message), fit logistic regression (scikit-learn offline, or a small JS softmax regression trained in the app), store weights as JSON. Retrain after every N new corrections.
- Calibration: use predicted probabilities; below a threshold (choose from a held-out split of the person's own labelled messages) return "unsure" and let the person choose, then add that message as a new labelled example. Check the threshold on held-out data, not on the training set.
- Cold start with under about 8 examples per label: fall back to cosine similarity to label-name or few exemplar embeddings, or ask the person. Accuracy of that fallback: none published.
- Escalate to SetFit only if held-out accuracy of the linear head is poor; it needs a Python training step and a bigger exported model.
- Verification before shipping: label a few hundred of the person's real messages, measure macro-F1, per-text latency and resident memory on the target Mac.

## Unknowns

- CPU latency per short text for MiniLM, bge-small, EmbeddingGemma, deberta-xsmall, Qwen3.5-0.8B on a recent Apple-silicon Mac: none published.
- RAM while running for every option: none published.
- bge-small-en-v1.5 int8 ONNX file size: not fetched. Size of onnxruntime-node and transformers.js in an Electron bundle: not measured.
- Accuracy of MiniLM-L6 on Banking77 (none found on its card) and accuracy of any option on this app's own labels (bug, feature, review, test, git-order, todo lists): none published.
- SetFit licence: not stated on the pages read. SetFit ONNX export details: tutorial exists, not read.
- Whether TypeSafe sells self-hosting or on-prem to enterprises: none published on pages I could read; docs returned 403.
- Qwen3.5-0.8B accuracy and speed as a classifier; sub-2B SmolLM newer than the 3B SmolLM3: none published / not found. Gemma 4 licence and size not confirmed from Google's own card.
- Qwen3.5 release date (2026-03-02) comes from a search result summary of the Qwen repo, not a page I fetched directly.
