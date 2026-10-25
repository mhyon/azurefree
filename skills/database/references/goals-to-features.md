# Goals → database features

Help the user get their app where they want it to go. Find out their goals in their own words. Then, at a few natural moments, share **one** useful insight that connects a goal to something Azure SQL can do, along with the smallest step they could take now.

Feature facts, free-vs-paid status and recipes live in [azure-sql-growth.md](azure-sql-growth.md). This file covers *what to ask*, *what to bring up* and *when*.

## Ground rules

- **Only suggest what traces back to the user.** It must connect to something they said, or something clearly visible in their code. No feature tours, and nothing for its own sake.
- **One insight at a time,** and at most two per skill run.
- **Be accurate and say what it costs.**
  - Take facts from azure-sql-growth.md, and say whether the feature works on their free database today.
  - Anything with a cost gets its price, a creation card and an explicit yes.
- **No pressure.**
  - Don't invent urgency, and don't use scary statistics.
  - Describe at most one concrete consequence, matter-of-factly.
  - Use numbers only if they come from Microsoft documentation or azure-sql-growth.md.
- **The general principle comes first.** State the good practice in vendor-neutral terms before naming the Azure SQL feature. If another approach would serve them as well or better, say so.
- **"Not needed" or "later" is final for that feature.**
  - Record it in `declined` in `.azure-free.json`.
  - Don't bring it up again unless the user's goals change or they ask about it.
- **Don't interrupt.** Never ask goal questions or share insights:
  - during sign-up
  - during error recovery
  - while a deploy is in progress
  - after the user has asked to "just get it running"

  In those cases, work from what the code shows.
- **Keep notes short.** Store goals as the short labels listed below, never as free text containing personal details.

## 1. Questions, in the user's language

There are two rounds at most. Skip any question the code already answers, for example per-user tables or an existing sign-in system.

### Round 1: purpose and people (start skill, right after detecting the project)

Use one AskUserQuestion with up to three questions:

1. **"What do you want this app to become?"**
   - Just for me
   - Me and a few people
   - Open to the public
   - A business or paid product
2. **"Will people have their own private data in it?"**
   - Yes, each person has their own
   - Some shared, some private
   - No, everyone sees the same things
   - Not sure yet
3. **"Will it hold anything you'd hate to see leaked?"** (multiple choice)
   - Emails or contact details
   - Payments or money records
   - Health, school or similar records
   - Nothing sensitive

### Round 2: what the data needs to do (database skill, before schema work)

Ask at most three of these. Choose the ones round 1 makes relevant: a business usually means reports and rules, a public app usually means search.

- "Do you want history or undo, like seeing what changed or getting back something deleted?"
- "Will people search through the content?"
- "Any AI ideas, like chatting with your data, 'find similar', or recommendations?"
- "Will you want reports or dashboards?"
- "Are there rules you have to follow, like school, client, GDPR or finance requirements?"

## 2. From goal to suggestion

| When the user… | What usually goes wrong later | Principle | Azure SQL feature | Smallest step now |
|---|---|---|---|---|
| has people with their own private data | One query that forgets `WHERE owner = …` shows someone else's data | Enforce ownership in one place, at the data layer | Row-level security (free today) | Add an owner column with a default from `SESSION_CONTEXT` now. Turn the policy on when accounts exist (recipe in azure-sql-growth.md). |
| is building a business with several customers or teams | Same as above, per customer | A customer column on every table, isolated at the data layer | Row-level security by tenant (free today) | Add a `tenant_id` column to every table now |
| stores contact details | Support screens, logs and exports show more than they need to | Show the minimum by default | Dynamic data masking (free today) | Mask email and phone columns for non-admin users |
| stores health, ID or similarly sensitive records | Anyone with database access can read them | Encrypt the most sensitive columns so even admins can't read them | Always Encrypted (free today; keys in Key Vault cost a little) | Decide which few columns need it before real data arrives. Encrypting existing data later means rewriting it. |
| handles payments, orders or money | "This record was changed" disputes, with no way to prove otherwise | Tamper-evident records | Ledger tables (free today; automatic digest storage is billed) | Create the money tables as ledger tables from the start. An existing table can't be converted in place. |
| wants history or undo | Hand-built audit tables drift out of date | Let the database keep history | Temporal tables (free today; history counts toward the 32 GB) | Turn on system versioning for the key tables. History starts only from the moment it's on. |
| wants search | `LIKE '%term%'` gets slow; a separate search service adds cost and syncing | Search where the data lives | Full-text search, regular expressions (free today) | A full-text index on the searchable columns |
| has AI ideas | A separate vector store means keeping two copies in sync | Keep embeddings next to the rows they describe | `VECTOR` type and vector index (free today; the embedding model is billed separately) | Add a `VECTOR` column when they start; index it once there are 100+ rows |
| wants reports or dashboards | Report queries slow down the app itself | Keep analytics fast without a second database | Columnstore indexes (free today). Fabric mirroring later (needs a Fabric capacity). | Nothing now. Mention it when tables get large. |
| keeps flexible or changing fields | Constant schema changes | Put the flexible part in a JSON column | Native `json` type (free today) | A `json` column for the flexible part |
| has rules to follow | Can't answer "who accessed this, and when?" | Keep an access record | Auditing (log storage costs a little); Entra-only sign-in is already on | Turn on auditing before real users arrive, after showing the cost |
| is going public or charging money | Surprises at launch | A short launch check | Backups and point-in-time restore (free, 7 days); Microsoft Defender for SQL (about USD 15 per server per month after a 30-day trial); auditing; the growth path | Bring up only the items that fit their goals |
| is building just for themselves | Nothing | n/a | n/a | Bring nothing up beyond the defaults |

## 3. The shape of one suggestion

Use five short beats, no more than five sentences in total:

1. **Their goal**, in their words: "You said friends might use this later."
2. **The insight:** what usually goes wrong for apps like theirs. Be specific and true.
3. **One concrete consequence**, stated matter-of-factly.
4. **The general principle**, in vendor-neutral terms.
5. **The Azure SQL feature:** whether it's free today, and the smallest step now.

Then ask one question with three answers: **Do it now · Later · Not needed**. Record "Later" and "Not needed" in `declined`.

Example, for a notes app:

> You mentioned this is for you now, and maybe a few friends later. The point where apps like this usually go wrong isn't traffic. It's the day a second person signs in, and every query has to remember to filter by owner; miss one, and someone sees someone else's notes. The safer pattern is to enforce ownership in one place, at the data layer. Azure SQL does that with row-level security, free on your current database, and adding an owner column now is a two-minute change instead of touching every query later.

## 4. When to bring things up

| Moment | What to do |
|---|---|
| **Start skill**, after detecting the project | Ask round 1. Use the answers in the recommendation, with at most one sentence linking a goal to Azure SQL. |
| **Database skill**, before schema work | Ask round 2. Offer the "smallest step now" items for their goals, because they're cheapest at this point. Each needs the user's OK. |
| **Database skill**, after the app is connected | At most two insights, each in the five-beat shape. |
| **Web skill**, when a custom domain is added or the user says they're launching | The launch-check row, limited to what fits their goals |
| **Status skill**, when growth shows (free amount running low, data growing, the user mentions more users) or their goals change | One insight that matches the change |
| **Any time** the user asks for something that maps to the table (search, sharing, history, AI, reports) | Give the principle and the Azure SQL way first, and name an equally good alternative if one exists. |
| **Never** | Sign-up, error recovery, a deploy in progress, "just get it running", or a declined feature (unless their goals changed) |

## 5. What to record

Keep `goals` in `.azure-free.json` as short labels only:

| Field | Allowed labels |
|---|---|
| `purpose` | `personal`, `small-group`, `public`, `business` |
| `privateData` | `per-person`, `mixed`, `shared`, `unknown` |
| `sensitive` | any of `contact`, `payments`, `regulated`, `none` |
| `needs` | any of `history`, `search`, `ai`, `reports`, `rules`, `flexible-data` |

`declined` is a list of `{ "feature": "<key>", "on": "YYYY-MM-DD" }`. The feature keys are:
`row-level-security`, `tenant-isolation`, `data-masking`, `always-encrypted`, `ledger`, `temporal`, `full-text`, `vectors`, `columnstore`, `json`, `auditing`, `defender`, `launch-check`.

Update `goals` whenever the user tells you something new about where the app is going.
