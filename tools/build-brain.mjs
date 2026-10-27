#!/usr/bin/env node
/* ============================================================
   Build the brain map.

   Nodes come from what is already on the site:
     content/writing/posts.json   published essays
     index.html                   work cards + article cards
     the topic table below        the hubs that connect them

   Edges are:
     note  → topic   (every note belongs to its scored topics)
     note  → note    (neighbours inside the same topic, by date)
     note  → note    (notes that share both of their topics)

   Output (committed, served by GitHub Pages):
     brain/brain.js               window.BRAIN for the hero canvas

   Run after changing posts, projects or articles:

     node tools/build-brain.mjs
   ============================================================ */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const OUT = path.join(ROOT, "brain/brain.js");

/* --- the hubs ----------------------------------------------
   Keywords are matched against title + description + tags.
   Weight, not order, decides which hub a note belongs to.  */

const TOPICS = [
  {
    slug: "vision",
    label: "Vision & 3D",
    keywords: {
      detection: 4, segmentation: 4, pose: 3, cnn: 4, convolutional: 4, convolution: 3,
      resnet: 4, alexnet: 4, vgg: 4, retinex: 4, "low-light": 3, pointnet: 4,
      "point cloud": 4, "3d": 2, backbone: 3, "feature map": 3, "activation function": 3,
      image: 1, images: 1, vision: 1,
    },
  },
  {
    slug: "vlm",
    label: "VLMs & Grounding",
    keywords: {
      vlm: 5, vlms: 5, "vision-language": 5, "vision–language": 5, clip: 4, blip: 4,
      grounding: 4, hallucination: 4, multimodal: 4, caption: 3, "video model": 3,
      "cross-modal": 3, attention: 3, visual: 2,
    },
  },
  {
    slug: "post-training",
    label: "Post-training & RL",
    keywords: {
      rlhf: 5, ppo: 5, dpo: 4, "reward model": 4, preference: 4, alignment: 4,
      "post-training": 5, sft: 4, "fine-tun*": 4, refusal: 3, jailbreak: 3,
      bradley: 4, clipping: 2, policy: 2, evals: 1,
    },
  },
  {
    slug: "generative",
    label: "Diffusion & Generative",
    keywords: {
      diffusion: 5, sdxl: 5, lora: 4, qlora: 4, dora: 4, latent: 3, "denois*": 4,
      autoencoder: 3, "style transfer": 4, generative: 3, "text-to-image": 4,
    },
  },
  {
    slug: "training",
    label: "Learning & Training",
    keywords: {
      "dataloader*": 5, ddp: 5, zero: 3, sharding: 4, memory: 2, gradient: 4, backprop: 4,
      initialization: 4, optimizer: 3, "learning rate": 4, keras: 4, dropout: 3,
      "data quality": 5, drift: 5, continual: 5, forgetting: 4, precision: 4,
      "fp16": 4, distributed: 3, training: 1, dbscan: 5, "connected components": 4,
      clustering: 4, similarity: 3,
    },
  },
  {
    slug: "llm",
    label: "LLMs & Inference",
    keywords: {
      llm: 4, llms: 4, "language model": 3, inference: 4, rag: 4, retrieval: 5,
      deepseek: 5, "mixture of experts": 4, moe: 3, vllm: 5, serving: 4, latency: 3,
      token: 2, tokens: 2, context: 1, "few-shot": 3, groq: 3, llama: 3, tts: 5,
      audio: 3, podcast: 5,
    },
  },
  {
    slug: "systems",
    label: "Systems & Edge",
    keywords: {
      ros2: 5, dds: 5, middleware: 5, "pub/sub": 5, "publish/subscribe": 5,
      deployment: 4, edge: 4, t4: 5, "consumer gpu": 4, throughput: 3, embedded: 4,
      "real-time": 3, quantisation: 3,
    },
  },
  {
    slug: "theory",
    label: "Math & Theory",
    keywords: {
      theorem: 5, "no free lunch": 6, logarithm: 4, "log number system": 5,
      "automatic differentiation": 5, derivative: 3, entropy: 3, probability: 3,
      "closed form": 3, convergence: 3, softmax: 3, "bradley-terry": 3,
    },
  },
];

/* --- reading the page -------------------------------------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();

function blocks(html, className) {
  const re = new RegExp(`<a class="card ${className}"[\\s\\S]*?<\\/a>`, "g");
  return [...html.matchAll(re)].map((m) => m[0]);
}

const grab = (block, re, fallback = "") => (block.match(re) || [, fallback])[1];

const index = await readFile(INDEX, "utf8");

const projects = blocks(index, "work-card").map((b, i) => ({
  id: `work:${i}`,
  kind: "project",
  label: text(grab(b, /<h3>([\s\S]*?)<\/h3>/)),
  blurb: text(grab(b, /<p>([\s\S]*?)<\/p>/)),
  tag: text(grab(b, /<span class="tag">([\s\S]*?)<\/span>/)),
  tags: [...b.matchAll(/<div class="work-foot">([\s\S]*?)<\/div>/g)]
    .map((m) => text(m[1]))
    .join(" "),
  url: grab(b, /href="([^"]+)"/),
  order: i,
}));

const articles = blocks(index, "article-card").map((b, i) => ({
  id: `article:${i}`,
  kind: "article",
  label: text(grab(b, /<h3>([\s\S]*?)<\/h3>/)),
  blurb: text(grab(b, /<p>([\s\S]*?)<\/p>/)),
  source: text(grab(b, /<span class="badge">([\s\S]*?)<\/span>/)),
  tags: "",
  url: grab(b, /href="([^"]+)"/),
  order: i,
}));

const allPosts = JSON.parse(
  await readFile(path.join(ROOT, "content/writing/posts.json"), "utf8")
);

const posts = allPosts
  .filter((p) => !p.draft)
  .map((p, i) => ({
    id: `post:${p.slug}`,
    kind: "post",
    label: p.title,
    blurb: p.description || "",
    tags: p.tag || "",
    url: `/writing/${p.slug}/`,
    order: i,
  }));

const notes = [...posts, ...articles, ...projects];

if (!posts.length || !articles.length || !projects.length) {
  throw new Error(
    `expected posts, article cards and work cards in index.html — got ` +
      `${posts.length} posts, ${articles.length} articles, ${projects.length} projects`
  );
}

/* --- assigning hubs ---------------------------------------- */

const topicTable = TOPICS.map((t) => ({
  ...t,
  id: `topic:${t.slug}`,
  kind: "topic",
  label: t.label,
  url: null,
  order: 0,
}));

/* Whole-word matching, with a trailing * for stems (fine-tun*, denois*).
   Plain substring matching linked "Knowledge" to the "edge" hub and
   "average" to "rag", which made a nonsense map. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const topic of topicTable) {
  topic.matchers = Object.entries(topic.keywords).map(([word, weight]) => {
    const stem = word.endsWith("*");
    const body = escapeRe(stem ? word.slice(0, -1) : word);
    const pattern = stem
      ? `(^|[^a-z0-9])${body}`
      : `(^|[^a-z0-9])${body}([^a-z0-9]|$)`;
    return { re: new RegExp(pattern), weight, word };
  });
}

function scoreTopics(note) {
  const haystack = ` ${note.label} ${note.blurb} ${note.tags} ${note.tag || ""} `.toLowerCase();
  return topicTable
    .map((topic) => {
      let score = 0;
      const hits = [];
      for (const { re, weight, word } of topic.matchers) {
        if (re.test(haystack)) {
          score += weight;
          hits.push(word);
        }
      }
      return { topic, score, hits };
    })
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

/* Anything the keyword table misses would float loose on the map.
   Fail loudly so the table gets fixed instead of one orphan node. */
const unmatched = [];
for (const note of notes) {
  note.topics = scoreTopics(note);
  if (!note.topics.length) unmatched.push(note.label);
}
if (unmatched.length) {
  throw new Error(
    `no topic matched these notes — add a keyword above:\n  ${unmatched.join("\n  ")}`
  );
}

if (process.argv.includes("--explain")) {
  for (const note of notes) {
    console.log(
      `${note.label}\n  ` +
        note.topics.map((t) => `${t.topic.label} (${t.score}) ← ${t.hits.join(", ")}`).join("\n  ")
    );
  }
  console.log("");
}

/* --- edges -------------------------------------------------- */

const links = [];
const seen = new Set();

function link(a, b, kind) {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (a === b || seen.has(key)) return;
  seen.add(key);
  links.push({ source: a, target: b, kind });
}

for (const note of notes) {
  for (const { topic } of note.topics) link(note.id, topic.id, "topic");
}

/* Neighbours inside the primary hub, in date order: the chain is what
   makes the map read as a brain instead of eight separate stars. */
const byPrimary = new Map();
for (const note of notes) {
  const primary = note.topics[0].topic.id;
  if (!byPrimary.has(primary)) byPrimary.set(primary, []);
  byPrimary.get(primary).push(note);
}
for (const group of byPrimary.values()) {
  group.sort((a, b) => a.order - b.order);
  for (let i = 1; i < group.length; i++) link(group[i - 1].id, group[i].id, "chain");
}

/* Notes that share both hubs are genuinely close — link them directly. */
for (let i = 0; i < notes.length; i++) {
  for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i].topics.map((t) => t.topic.slug);
    const b = notes[j].topics.map((t) => t.topic.slug);
    if (a.length === 2 && b.length === 2 && a.every((s) => b.includes(s))) {
      link(notes[i].id, notes[j].id, "pair");
    }
  }
}

/* --- writing the map ---------------------------------------- */

const degree = new Map();
for (const l of links) {
  degree.set(l.source, (degree.get(l.source) || 0) + 1);
  degree.set(l.target, (degree.get(l.target) || 0) + 1);
}

const nodes = [...notes, ...topicTable].map((n) => ({
  id: n.id,
  label: n.label,
  kind: n.kind,
  url: n.url || null,
  source: n.source || n.tag || null,
  topics: n.topics ? n.topics.map((t) => t.topic.slug) : [],
  degree: degree.get(n.id) || 0,
}));

const brain = {
  generated: new Date().toISOString().slice(0, 10),
  counts: {
    posts: posts.length,
    articles: articles.length,
    projects: projects.length,
    topics: topicTable.length,
    links: links.length,
  },
  nodes,
  links,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  "/* Generated by tools/build-brain.mjs — edit the content, not this file. */\n" +
    `window.BRAIN = ${JSON.stringify(brain)};\n`
);

/* --- report ------------------------------------------------ */

console.log(
  `brain: ${nodes.length} nodes · ${links.length} links ` +
    `(${posts.length} posts, ${articles.length} articles, ${projects.length} projects)`
);
for (const topic of topicTable) {
  const members = notes.filter((n) => n.topics.some((t) => t.topic.id === topic.id));
  console.log(`  ${topic.label.padEnd(22)} ${members.length}`);
}
