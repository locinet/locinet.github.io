---
layout: layout.njk
pageTitle: "Contributing — Locinet"
---

# How to Add a Work to Locinet

Locinet is a directory of theological works hosted on the internet. Anyone can contribute by adding works using the steps below. No programming knowledge is needed.

## What you need

- A free [GitHub account](https://github.com/signup) (for submitting your contribution)
- A theological work that is available to read online in English
- Access to any AI chatbot (ChatGPT, Claude, Gemini, etc.) — to help fill in the file

## Overview

Each work on Locinet is described by a small text file in a format called YAML. You will:

1. Start a new file from the site
2. Fill in the basic details yourself
3. Use AI to generate sections and topic tags
4. Paste the result into GitHub and submit it for review

---

## Step 1: Start a new file

On the [Locinet home page](/), click **"Add a work"** in the top right corner. Search for the author by name. A list of results will appear.

- If the author already has works on the site, you will see a **checkmark** next to their name. Click them — the file will have their ID already filled in.
- If the author is not on the site yet, click them to start a new file. (Their information will be fetched from Wikidata automatically on the next site build.)

This opens a new file on GitHub with a template that looks like this:

```yaml
# New work for Thomas Aquinas
# Guide: https://locinet.github.io/contributing/
#
# Instructions:
#   1. Change the work ID below (e.g. calvin-institutes)
#   2. Fill in the title, year, and translation fields
#   3. Use AI to add sections and loci tags (see guide)
#   4. Click "Commit changes" and open a pull request

CHANGE-THIS-ID:  # <-- replace with a short slug (e.g. author-short-title)
  author: Q9438  # Thomas Aquinas — do not change
  # category: systematic  # Optional: systematic, monograph, sermons
  la:  # Change to original language if not Latin (fr, de, nl, etc.)
    title:  # Original-language title
    orig_lang: true
    editions:
      - year:  # Year of first publication
  en:
    title:  # English title
    # sections:  # Use AI to generate sections from a table of contents
    translations:
      - translator:  # Translator name
        sites:
          - site:  # Website name (e.g. CCEL, Internet Archive)
            url:  # URL to the full text
```

## Step 2: Fill in the basics

Fill in the following fields by hand. You can do this directly in the GitHub text editor.

**Work ID** — Replace `CHANGE-THIS-ID` with a short identifier for the work. Use lowercase letters and hyphens only. Example: `anselm-cur-deus-homo`, `calvin-institutes`, `rollock-predestination`.

**Original language title** — After `title:` under the `la:` block, type the title in the original language. If the work was originally written in a language other than Latin, change `la:` to the correct language code (`fr:` for French, `de:` for German, `nl:` for Dutch, `en:` for English, etc.).

**Year** — The year the work was first published or written.

**English title** — After `title:` under the `en:` block, type the English title.

**Translator** — The name of the English translator. If the translation was done by AI, delete the `translator:` line and add `AI: true` instead.

**Site and URL** — The name of the website hosting the English text (e.g. "CCEL", "Internet Archive", "Google Books") and the full URL.

Here is an example of a simple completed file:

```yaml
rollock-predestination:
  author: Q7349365
  category: monograph
  loci: predestination
  la:
    title: De aeterna mentis divinae approbatione et reprobatione
    orig_lang: true
  en:
    title: On the Eternal Approbation and Reprobation of the Divine Mind
    translations:
      - AI: true
        sites:
          - site: Confessionally Reformed
            url: https://confessionallyreformed.wordpress.com/2026/01/29/robert-rollock-c-1555-1599-on-the-eternal-approbation-and-reprobation-of-the-divine-mind/
```

If the work is short and doesn't have chapters or sections, you can skip the next step and go straight to submitting.

---

## Step 3: Use AI to add sections and loci tags

For works with chapters or a table of contents, you can use AI to generate the sections and topic tags. This is the most powerful part of the process — AI can do in seconds what would take a long time by hand.

### What are sections and loci?

**Sections** are chapters, parts, questions, or other divisions of the work. They appear as a clickable table of contents on the author's page.

**Loci** (Latin for "places" or "topics") are tags that classify what a section is about. Locinet uses a fixed set of topic tags organized in a tree. You can see the full list on the [Tagging Reference](/tagging-reference/) page. Examples: `scripture`, `trinity`, `original-sin`, `justification`, `baptism`.

### How to prompt the AI

Open any AI chatbot and paste a prompt like the one below. You will need to give the AI two things:

1. **The table of contents** of the work (copy it from the website, or type out the chapter titles)
2. **The list of valid loci tags** (copy the list below)

Here is a prompt you can copy and modify:

---

> I'm adding a theological work to a directory website. I need you to format the table of contents as YAML sections and tag each section with topic tags ("loci") from a fixed list.
>
> **The work:** [Title] by [Author]
>
> **Table of contents:**
>
> [Paste the table of contents here]
>
> **Rules:**
> - Each section needs a unique short ID (lowercase, hyphens, e.g. `ch1`, `b2ch3`, `q1-a2`)
> - Section titles should be in title case and include their original numbering
> - Only assign loci tags when a section has **extended discussion** of that topic
> - Use the most specific tag that fits; fall back to a broader parent tag if no specific one applies
> - A section can have multiple tags as an array: `loci: [tag1, tag2]`
> - Don't repeat a tag on a child section if the parent section already has it
> - Colons in titles need quoting: `"Chapter X: On the Law"`
>
> **Valid loci tags (use ONLY these):**
>
> theology, nature-of-theology, natural-theology, supernatural-theology, scripture, illumination, credibility-of-scripture, sufficiency-of-scripture, god, being-of-god, existence-of-god, knowability-of-god, attributes-of-god, divine-simplicity, goodness-of-god, invisibility-of-god, power-of-god, divine-perfection, divine-infinity, divine-immutability, divine-eternity, divine-love, divine-justice, divine-mercy, unity-of-god, knowledge-of-god, will-of-god, names-of-god, trinity, works-of-god, creation, predestination, reprobation, providence, angels, nature-of-angels, fall-of-angels, man, nature-of-man, soul, conscience, image-of-god, free-will, original-righteousness, happiness, human-acts, passions, virtue, prudence, justice, fortitude, temperance, sin, origin-of-sin, nature-of-sin, fall-of-man, original-sin, transmission-of-sin, concupiscence, punishment-of-sin, grace, covenant-of-grace, old-covenant, new-covenant, gospel, spiritual-gifts, law, eternal-law, natural-law, human-law, moral-law, worship, idolatry, oaths, sabbath, chastity, war, property, truth, ceremonial-law, judicial-law, purpose-of-law, christian-liberty, christ, person-of-christ, names-of-christ, natures-of-christ, incarnation, states-of-christ, state-of-humiliation, state-of-exaltation, offices-of-christ, prophetic-office, priestly-office, atonement, kingly-office, salvation, union-with-christ, calling, external-calling, effectual-calling, faith, hope, charity, repentance, justification, sanctification, adoption, good-works, merit, perseverance, glorification, church, nature-of-the-church, unity-of-the-church, true-church, government-of-the-church, papacy, ordination, church-discipline, power-of-the-church, means-of-grace, word-of-god, sacraments, baptism, lords-supper, penance, indulgences, confirmation, extreme-unction, prayer, marriage, civil-government, last-things, death, intermediate-state, purgatory, second-coming, millennium, resurrection-of-the-dead, final-judgement, beatific-vision, final-state
>
> **Output only the YAML `sections:` block**, indented with 4 spaces (to go under the `en:` key). Example format:
>
> ```yaml
>     sections:
>       - book-one: Book One
>         sections:
>           - b1ch1: "Chapter I: On God"
>             loci: being-of-god
>           - b1ch2: "Chapter II: On the Trinity"
>             loci: trinity
> ```

---

### Paste the AI output into your file

Copy the `sections:` block from the AI response and paste it into your YAML file under the `en:` key, replacing the `# sections:` comment line. Make sure it is indented correctly — the word `sections` should line up with `title` under `en:`.

The result should look something like this:

```yaml
  en:
    title: Why God Became Man
    sections:
      - book-first: Book First
        sections:
          - b1ch1: "Chapter I. The question on which the whole work rests"
          - b1ch2: "Chapter II. How those things which are to be said should be received"
          - b1ch3: "Chapter III. Objections of infidels and replies of believers"
    translations:
      - translator: Sidney Norton Deane
        year: 1909
        sites:
          - site: CCEL
            url: https://ccel.org/ccel/a/anselm/basic_works.vi.html
```

### Tips

- If the AI's output doesn't look right, ask it to fix specific issues ("the section IDs should be shorter", "add loci tags", etc.)
- You can also add a `loci:` tag at the work level (right under `author:`) if the entire work is about one topic — for example, `loci: predestination` for a treatise on predestination
- The AI may occasionally make up a tag that isn't in the list. Double-check that all tags are from the list above.

---

## Step 4: Submit your contribution

Once your file is complete:

1. At the top of the GitHub editor, change the filename if needed. It should follow the pattern `authorname-worktitle.yaml` (e.g. `anselm-cur-deus-homo.yaml`)
2. Scroll down to **"Commit changes"**
3. Select **"Create a new branch for this commit and start a pull request"**
4. Click **"Propose changes"**
5. On the next page, click **"Create pull request"**

A maintainer will review your submission and may suggest edits. Once approved, the work will appear on the site.

---

## YAML formatting tips

YAML is a simple text format, but spacing matters. Here are the most common issues:

- **Indentation must use spaces, not tabs.** Use 2 spaces for each level.
- **Colons in titles need quotes.** Write `"Chapter X: On the Law"` not `Chapter X: On the Law`.
- **`sections` and `translations` go under the language key** (e.g. `en:`), at the same level as `title`. They are siblings of `title`, not children.

Correct:
```yaml
  en:
    title: Some Title
    sections:
      - ch1: Chapter 1
    translations:
      - translator: Name
```

Wrong (sections indented under title):
```yaml
  en:
    title: Some Title
      sections:    # WRONG — too far indented
```

---

## Questions?

If you run into problems, [open an issue on GitHub](https://github.com/locinet/locinet.github.io/issues) and describe what you're trying to do. We're happy to help.
